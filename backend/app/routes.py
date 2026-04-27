from datetime import date, timedelta
from flask import Blueprint, request, jsonify, session, current_app
from sqlalchemy import nullslast, func, desc
from .models import Artist, Genre, Discussion, Post, LLMJob, Album, User, album_genres
from . import db

bp = Blueprint("api", __name__, url_prefix="/api")


def _artist_list_counts_by_id(artist_ids):
    """Discussion and distinct-listener counts per artist id (two queries for the whole page)."""
    if not artist_ids:
        return {}, {}
    discussion_rows = (
        db.session.query(Discussion.artist_id, func.count(Discussion.id))
        .filter(Discussion.artist_id.in_(artist_ids))
        .group_by(Discussion.artist_id)
        .all()
    )
    disc = {int(aid): int(c) for aid, c in discussion_rows}
    listener_rows = (
        db.session.query(
            Discussion.artist_id,
            func.count(func.distinct(Post.author_user_id)),
        )
        .join(Post, Post.discussion_id == Discussion.id)
        .filter(Discussion.artist_id.in_(artist_ids))
        .filter(Post.is_deleted.is_(False))
        .group_by(Discussion.artist_id)
        .all()
    )
    lstn = {int(aid): int(c) for aid, c in listener_rows}
    return disc, lstn


def _artist_latest_thread_payload_by_id(artist_ids):
    """Per artist: latest discussion by last_activity_at (id tie-break). NULL last_activity_at last."""
    empty = {"id": None, "title": None, "timestamp": None}
    if not artist_ids:
        return {}, empty
    ranked_sub = (
        db.session.query(
            Discussion.id.label("discussion_id"),
            Discussion.artist_id.label("aid"),
            func.row_number()
            .over(
                partition_by=Discussion.artist_id,
                order_by=(desc(Discussion.last_activity_at).nullslast(), desc(Discussion.id)),
            )
            .label("rn"),
        )
        .filter(Discussion.artist_id.in_(artist_ids))
        .subquery()
    )
    candidates = (
        db.session.query(Discussion)
        .join(ranked_sub, Discussion.id == ranked_sub.c.discussion_id)
        .filter(ranked_sub.c.rn == 1)
        .all()
    )
    return {
        int(d.artist_id): {
            "id": str(d.id),
            "title": d.title,
            "timestamp": d.last_activity_at.isoformat() if d.last_activity_at else None,
        }
        for d in candidates
    }, empty


@bp.route("/artists")
def get_artists():
    """Return paginated artist list with optional active_discussions, genre, and sort filters."""
    query = Artist.query

    # Filter: active discussions (activity_score >= 8.5)
    active_discussions = request.args.get("active_discussions", "false").lower() == "true"
    if active_discussions:
        query = query.filter(Artist.activity_score >= 8.5)

    # Filter: genres (multi-value)
    genres = request.args.getlist("genre")
    if genres:
        query = query.filter(Artist.genres.any(Genre.name.in_(genres)))

    # Sort
    sort = request.args.get("sort", "activity")
    if sort == "recent":
        disc_count_subq = (
            db.session.query(
                Discussion.artist_id.label("artist_id"),
                func.count(Discussion.id).label("discussion_count"),
            )
            .group_by(Discussion.artist_id)
            .subquery()
        )
        query = (
            query.outerjoin(disc_count_subq, disc_count_subq.c.artist_id == Artist.id)
            .order_by(
                func.coalesce(disc_count_subq.c.discussion_count, 0).desc(),
                Artist.id.asc(),
            )
        )
    else:
        query = query.order_by(Artist.activity_score.desc())

    # Pagination
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 12, type=int)

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    items = paginated.items
    ids = [a.id for a in items]
    disc_map, listen_map = _artist_list_counts_by_id(ids)
    latest_map, latest_empty = _artist_latest_thread_payload_by_id(ids)
    artists_out = [
        a.to_dict(
            list_counts={
                "discussion": disc_map.get(a.id, 0),
                "listeners": listen_map.get(a.id, 0),
                "latestThread": latest_map.get(a.id, latest_empty),
            }
        )
        for a in items
    ]

    return jsonify(
        {
            "artists": artists_out,
            "total": paginated.total,
            "page": paginated.page,
            "pages": paginated.pages,
        }
    )


@bp.route("/artists", methods=["POST"])
def create_artist():
    if not current_app.config.get("ENABLE_CATALOG_WRITE"):
        return jsonify({"error": "Catalog write is disabled"}), 403

    if not session.get("user_id"):
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    image_url = (data.get("imageUrl") or "").strip() or None
    bio = (data.get("bio") or "").strip() or None
    genre_names = data.get("genres") or []

    if not name:
        return jsonify({"error": "name is required"}), 400

    artist = Artist(
        name=name,
        image_url=image_url,
        bio=bio,
        activity_score=0.0,
        discussion_count=0,
        latest_thread_title=None,
        latest_thread_timestamp=None,
    )
    db.session.add(artist)
    db.session.flush()

    if isinstance(genre_names, list):
        for gname in genre_names:
            g = (gname or "").strip()
            if not g:
                continue
            genre = Genre.query.filter_by(name=g).first()
            if not genre:
                genre = Genre(name=g)
                db.session.add(genre)
                db.session.flush()
            artist.genres.append(genre)

    db.session.commit()
    return jsonify({"artist": artist.to_dict()}), 201


@bp.route("/artists/<int:artist_id>")
def get_artist(artist_id):
    artist = Artist.query.get(artist_id)
    if not artist:
        return jsonify({"error": "Artist not found"}), 404
    return jsonify({"artist": artist.to_dict()})


@bp.route("/genres")
def get_genres():
    genres = Genre.query.order_by(Genre.name).all()
    return jsonify({"genres": [g.name for g in genres]})


@bp.route("/events", methods=["POST"])
def post_event():
    data = request.get_json(silent=True) or {}
    event_type = data.get("eventType", "")
    artist_id = data.get("artistId")

    if not artist_id:
        return jsonify({"error": "artistId is required"}), 400

    if not session.get("user_id"):
        return jsonify({"error": "Authentication required"}), 401

    from .services.trigger_handler import TriggerHandlerService
    result = TriggerHandlerService().handle_event(event_type, int(artist_id))

    if "error" in result:
        return jsonify(result), 404
    return jsonify(result), 200


@bp.route("/artists/<int:artist_id>/discussions")
def get_artist_discussions(artist_id):
    artist = Artist.query.get(artist_id)
    if not artist:
        return jsonify({"error": "Artist not found"}), 404

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    paginated = (
        Discussion.query.filter_by(artist_id=artist_id)
        .order_by(Discussion.last_activity_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    return jsonify({
        "discussions": [d.to_dict() for d in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages,
    })


@bp.route("/discussions/<int:discussion_id>/posts", methods=["POST"])
def create_post(discussion_id):
    from datetime import datetime, timezone
    from .models import User

    discussion = Discussion.query.get(discussion_id)
    if not discussion:
        return jsonify({"error": "Discussion not found"}), 404

    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "Body is required"}), 400

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    author = User.query.get(user_id)
    if not author:
        session.pop("user_id", None)
        return jsonify({"error": "Invalid session"}), 401

    post = Post(
        discussion_id=discussion_id,
        author_user_id=author.id,
        body=body,
    )
    db.session.add(post)

    # Keep discussion counters in sync
    discussion.post_count = (discussion.post_count or 0) + 1
    discussion.last_activity_at = datetime.now(timezone.utc)

    db.session.commit()

    # Trigger LLM responses to the user's post in this specific discussion
    from .services.trigger_handler import TriggerHandlerService
    TriggerHandlerService().handle_user_reply(
        artist_id=discussion.artist_id,
        discussion_id=discussion_id,
    )

    return jsonify({"post": post.to_dict()}), 201


@bp.route("/discussions/<int:discussion_id>/posts")
def get_discussion_posts(discussion_id):
    discussion = Discussion.query.get(discussion_id)
    if not discussion:
        return jsonify({"error": "Discussion not found"}), 404

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)

    paginated = (
        Post.query.filter_by(discussion_id=discussion_id, is_deleted=False)
        .order_by(Post.created_at.asc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    return jsonify({
        "posts": [p.to_dict() for p in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages,
        "discussion": discussion.to_dict(),
    })


@bp.route("/albums")
def get_albums():
    query = Album.query

    # Include synthetic seed rows by default; opt-out with `include_synthetic=false`.
    include_synthetic = request.args.get("include_synthetic", "true").lower() != "false"
    if not include_synthetic:
        query = query.filter(~Album.title.like("Crescendo Catalog #%"))
        query = query.filter(~Album.title.like("Spotlight —%"))

    # Filter: genres (multi-value)
    genres = request.args.getlist("genre")
    if genres:
        query = query.filter(Album.genres.any(Genre.name.in_(genres)))

    # Filter: album type
    album_type = request.args.get("type")
    if album_type:
        query = query.filter(Album.album_type == album_type)

    # Filter: time_range
    time_range = request.args.get("time_range", "all-time")
    today = date.today()
    if time_range in ("2026", "2025", "2024"):
        query = query.filter(Album.release_year == int(time_range))
    elif time_range == "today":
        query = query.filter(Album.release_date == today)
    elif time_range == "this-week":
        query = query.filter(Album.release_date >= today - timedelta(days=7), Album.release_date <= today)
    elif time_range == "this-month":
        query = query.filter(Album.release_date >= today - timedelta(days=30), Album.release_date <= today)
    elif time_range == "upcoming":
        query = query.filter(Album.release_date > today)

    # Sort
    sort = request.args.get("sort", "user_score")
    if sort == "critic_score":
        query = query.order_by(nullslast(Album.critic_score.desc()))
    elif sort == "release_date":
        query = query.order_by(Album.release_date.desc())
    elif sort == "review_count":
        query = query.order_by(Album.review_count.desc())
    else:
        query = query.order_by(Album.user_score.desc())

    # Pagination
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 12, type=int)
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "albums": [a.to_dict() for a in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages,
    })


@bp.route("/albums", methods=["POST"])
def create_album():
    if not current_app.config.get("ENABLE_CATALOG_WRITE"):
        return jsonify({"error": "Catalog write is disabled"}), 403

    if not session.get("user_id"):
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    artist_id = data.get("artistId")
    cover_url = (data.get("coverUrl") or "").strip() or None
    release_year = data.get("releaseYear")
    album_type = (data.get("albumType") or "studio").strip() or "studio"
    genre_names = data.get("genres") or []

    if not title:
        return jsonify({"error": "title is required"}), 400
    if not artist_id:
        return jsonify({"error": "artistId is required"}), 400

    if isinstance(artist_id, bool):
        return jsonify({"error": "artistId must be a valid integer"}), 400
    if isinstance(artist_id, float):
        if not artist_id.is_integer():
            return jsonify({"error": "artistId must be a valid integer"}), 400
        artist_id_int = int(artist_id)
    elif isinstance(artist_id, int):
        artist_id_int = artist_id
    else:
        try:
            artist_id_int = int(str(artist_id).strip())
        except (TypeError, ValueError):
            return jsonify({"error": "artistId must be a valid integer"}), 400

    artist = Artist.query.get(artist_id_int)
    if not artist:
        return jsonify({"error": "Artist not found"}), 404

    year = None
    if release_year is not None and release_year != "":
        if isinstance(release_year, bool):
            return jsonify({"error": "releaseYear must be a valid integer"}), 400
        if isinstance(release_year, float):
            if not release_year.is_integer():
                return jsonify({"error": "releaseYear must be a valid integer"}), 400
            year = int(release_year)
        elif isinstance(release_year, int):
            year = release_year
        else:
            try:
                year = int(str(release_year).strip())
            except (TypeError, ValueError):
                return jsonify({"error": "releaseYear must be a valid integer"}), 400
    if year is not None and (year < 1 or year > 9999):
        return jsonify({"error": "releaseYear must be between 1 and 9999"}), 400
    release_date = date(year, 1, 1) if year else None
    album = Album(
        title=title,
        artist_id=artist.id,
        cover_url=cover_url,
        release_date=release_date,
        release_year=year,
        user_score=0.0,
        critic_score=None,
        review_count=0,
        discussion_count=0,
        list_appearances=0,
        album_type=album_type,
    )
    db.session.add(album)
    db.session.flush()

    if isinstance(genre_names, list):
        for gname in genre_names:
            g = (gname or "").strip()
            if not g:
                continue
            genre = Genre.query.filter_by(name=g).first()
            if not genre:
                genre = Genre(name=g)
                db.session.add(genre)
                db.session.flush()
            album.genres.append(genre)

    db.session.commit()
    return jsonify({"album": album.to_dict()}), 201


@bp.route("/albums/genres")
def get_album_genres():
    stats_rows = (
        db.session.query(
            Genre.id.label("genre_id"),
            Genre.name.label("genre_name"),
            func.count(Album.id).label("album_count"),
            func.avg(Album.user_score).label("avg_score"),
        )
        .outerjoin(album_genres, album_genres.c.genre_id == Genre.id)
        .outerjoin(Album, Album.id == album_genres.c.album_id)
        .group_by(Genre.id, Genre.name)
        .order_by(Genre.name)
        .all()
    )

    cover_ranked = (
        db.session.query(
            album_genres.c.genre_id.label("genre_id"),
            func.coalesce(Album.cover_url, Artist.image_url).label("cover_url"),
            func.row_number()
            .over(
                partition_by=album_genres.c.genre_id,
                order_by=(nullslast(Album.user_score.desc()), Album.id.asc()),
            )
            .label("rn"),
        )
        .select_from(album_genres)
        .join(Album, Album.id == album_genres.c.album_id)
        .outerjoin(Artist, Artist.id == Album.artist_id)
        .filter(func.coalesce(Album.cover_url, Artist.image_url).isnot(None))
        .subquery()
    )

    cover_rows = (
        db.session.query(cover_ranked.c.genre_id, cover_ranked.c.cover_url)
        .filter(cover_ranked.c.rn <= 4)
        .order_by(cover_ranked.c.genre_id.asc(), cover_ranked.c.rn.asc())
        .all()
    )
    cover_map = {}
    for genre_id, cover_url in cover_rows:
        cover_map.setdefault(int(genre_id), []).append(cover_url)

    result = []
    for row in stats_rows:
        count = int(row.album_count or 0)
        if count == 0:
            continue
        avg_score = round(float(row.avg_score), 1) if row.avg_score is not None else 0.0
        result.append({
            "name": row.genre_name,
            "albumCount": count,
            "avgScore": avg_score,
            "coverImages": cover_map.get(int(row.genre_id), []),
        })

    result.sort(key=lambda x: x["albumCount"], reverse=True)
    return jsonify({"genres": result})


@bp.route("/discussions")
def get_all_discussions():
    sort = request.args.get("sort", "recent")
    if sort == "popular":
        query = Discussion.query.order_by(Discussion.post_count.desc())
    else:
        query = Discussion.query.order_by(Discussion.last_activity_at.desc())

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "discussions": [d.to_dict() for d in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages,
    })


# Platform stats endpoint — returns aggregate counts for the home page banner
@bp.route("/stats")
def get_stats():
    from .models import LLMPersona
    artist_count = Artist.query.count()
    discussion_count = Discussion.query.count()
    post_count = Post.query.filter_by(is_deleted=False).count()
    bot_count = User.query.filter_by(is_bot=True).count()
    user_count = User.query.filter_by(is_bot=False).count()
    return jsonify({
        "artistCount": artist_count,
        "discussionCount": discussion_count,
        "postCount": post_count,
        "botCount": bot_count,
        "userCount": user_count,
        "catalogWriteEnabled": bool(current_app.config.get("ENABLE_CATALOG_WRITE")),
    })


@bp.route("/search")
def search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"artists": [], "albums": []})

    pattern = f"%{q}%"
    artists = Artist.query.filter(Artist.name.ilike(pattern)).limit(5).all()
    albums = Album.query.filter(Album.title.ilike(pattern)).limit(5).all()
    a_ids = [a.id for a in artists]
    disc_map, listen_map = _artist_list_counts_by_id(a_ids)
    latest_map, latest_empty = _artist_latest_thread_payload_by_id(a_ids)

    return jsonify({
        "artists": [
            a.to_dict(
                list_counts={
                    "discussion": disc_map.get(a.id, 0),
                    "listeners": listen_map.get(a.id, 0),
                    "latestThread": latest_map.get(a.id, latest_empty),
                }
            )
            for a in artists
        ],
        "albums": [a.to_dict() for a in albums],
    })

from datetime import date, timedelta
import os
from flask import Blueprint, request, jsonify, session, current_app
from sqlalchemy import nullslast, func
from .models import Artist, Genre, Discussion, Post, LLMJob, Album, User
from . import db

bp = Blueprint("api", __name__, url_prefix="/api")


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
            db.session.query(func.count(Discussion.id))
            .filter(Discussion.artist_id == Artist.id)
            .correlate(Artist)
            .scalar_subquery()
        )
        query = query.order_by(disc_count_subq.desc())
    else:
        query = query.order_by(Artist.activity_score.desc())

    # Pagination
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 12, type=int)

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify(
        {
            "artists": [a.to_dict() for a in paginated.items],
            "total": paginated.total,
            "page": paginated.page,
            "pages": paginated.pages,
        }
    )


@bp.route("/artists", methods=["POST"])
def create_artist():
    if not os.environ.get("ENABLE_CATALOG_WRITE") and not current_app.config.get("ENABLE_CATALOG_WRITE"):
        return jsonify({"error": "Catalog write is disabled"}), 404

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

    # Hide synthetic seed rows by default (they're only for demos).
    # Opt-in to include them with `include_synthetic=true`.
    include_synthetic = request.args.get("include_synthetic", "false").lower() == "true"
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
    if not os.environ.get("ENABLE_CATALOG_WRITE") and not current_app.config.get("ENABLE_CATALOG_WRITE"):
        return jsonify({"error": "Catalog write is disabled"}), 404

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

    artist = Artist.query.get(int(artist_id))
    if not artist:
        return jsonify({"error": "Artist not found"}), 404

    year = int(release_year) if release_year else None
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
    genres = Genre.query.order_by(Genre.name).all()
    result = []
    for genre in genres:
        albums = genre.albums
        if not albums:
            continue
        count = len(albums)
        scores = [a.user_score for a in albums if a.user_score is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        cover_images = [
            (a.cover_url or (a.artist.image_url if a.artist else None))
            for a in albums[:4]
            if (a.cover_url or (a.artist.image_url if a.artist else None))
        ]
        result.append({
            "name": genre.name,
            "albumCount": count,
            "avgScore": avg_score,
            "coverImages": cover_images,
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
    })


@bp.route("/search")
def search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"artists": [], "albums": []})

    pattern = f"%{q}%"
    artists = Artist.query.filter(Artist.name.ilike(pattern)).limit(5).all()
    albums = Album.query.filter(Album.title.ilike(pattern)).limit(5).all()

    return jsonify({
        "artists": [a.to_dict() for a in artists],
        "albums": [a.to_dict() for a in albums],
    })

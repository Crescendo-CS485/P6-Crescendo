from flask import Blueprint, request, jsonify, session
from .models import List, ListAlbum, ListLike, Album
from . import db

list_bp = Blueprint("lists", __name__, url_prefix="/api/lists")


def _with_liked(lst_dict, list_id, user_id):
    liked = bool(
        ListLike.query.filter_by(list_id=list_id, user_id=user_id).first()
    ) if user_id else False
    lst_dict["userHasLiked"] = liked
    return lst_dict


@list_bp.route("", methods=["GET"])
def get_lists():
    user_id = session.get("user_id")
    lists = List.query.order_by(List.id).all()

    if user_id:
        liked_ids = {
            ll.list_id
            for ll in ListLike.query.filter_by(user_id=user_id).all()
        }
    else:
        liked_ids = set()

    result = []
    for l in lists:
        d = l.to_dict()
        d["userHasLiked"] = l.id in liked_ids
        result.append(d)

    return jsonify({"lists": result, "total": len(lists)})


@list_bp.route("/<int:list_id>", methods=["GET"])
def get_list(list_id):
    lst = List.query.get(list_id)
    if not lst:
        return jsonify({"error": "List not found"}), 404
    d = lst.to_dict(include_albums=True)
    _with_liked(d, list_id, session.get("user_id"))
    return jsonify({"list": d})


@list_bp.route("", methods=["POST"])
def create_list():
    creator_user_id = session.get("user_id")
    if not creator_user_id:
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip() or None

    if not title:
        return jsonify({"error": "Title is required"}), 400

    lst = List(
        title=title,
        description=description,
        creator_user_id=creator_user_id,
        like_count=0,
    )
    db.session.add(lst)
    db.session.commit()
    return jsonify({"list": lst.to_dict()}), 201


@list_bp.route("/<int:list_id>/albums", methods=["POST"])
def add_album(list_id):
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "Authentication required"}), 401

    lst = List.query.get(list_id)
    if not lst:
        return jsonify({"error": "List not found"}), 404

    if lst.creator_user_id is None or lst.creator_user_id != uid:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(silent=True) or {}
    album_id = data.get("albumId")
    if not album_id:
        return jsonify({"error": "albumId is required"}), 400

    album = Album.query.get(int(album_id))
    if not album:
        return jsonify({"error": "Album not found"}), 404

    existing = ListAlbum.query.filter_by(list_id=list_id, album_id=album.id).first()
    if not existing:
        la = ListAlbum(list_id=list_id, album_id=album.id)
        db.session.add(la)
        db.session.commit()

    return jsonify({"list": lst.to_dict(include_albums=True)}), 200


@list_bp.route("/<int:list_id>/like", methods=["POST"])
def toggle_like(list_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Sign in to like a list"}), 401

    lst = db.session.get(List, list_id)
    if not lst:
        return jsonify({"error": "List not found"}), 404

    existing = db.session.execute(
        db.select(ListLike).filter_by(list_id=list_id, user_id=user_id)
    ).scalar_one_or_none()

    if existing:
        db.session.delete(existing)
        like_count = max(0, lst.like_count - 1)
        liked = False
    else:
        db.session.add(ListLike(list_id=list_id, user_id=user_id))
        like_count = lst.like_count + 1
        liked = True

    lst.like_count = like_count
    db.session.commit()
    return jsonify({"liked": liked, "likeCount": like_count})


@list_bp.route("/<int:list_id>/fork", methods=["POST"])
def fork_list(list_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Sign in to copy a list"}), 401

    source = List.query.get(list_id)
    if not source:
        return jsonify({"error": "List not found"}), 404

    fork = List(
        title=f"{source.title} (copy)",
        description=source.description,
        creator_user_id=user_id,
        like_count=0,
    )
    db.session.add(fork)
    db.session.flush()

    for la in source.list_albums:
        db.session.add(ListAlbum(list_id=fork.id, album_id=la.album_id))

    db.session.commit()
    return jsonify({"list": fork.to_dict()}), 201


@list_bp.route("/<int:list_id>/albums/<int:album_id>", methods=["DELETE"])
def remove_album(list_id, album_id):
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "Authentication required"}), 401

    lst = List.query.get(list_id)
    if not lst:
        return jsonify({"error": "List not found"}), 404

    if lst.creator_user_id is None or lst.creator_user_id != uid:
        return jsonify({"error": "Forbidden"}), 403

    la = ListAlbum.query.filter_by(list_id=list_id, album_id=album_id).first()
    if la:
        db.session.delete(la)
        db.session.commit()

    return jsonify({"list": lst.to_dict(include_albums=True)}), 200

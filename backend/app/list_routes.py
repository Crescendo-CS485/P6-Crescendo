from flask import Blueprint, request, jsonify, session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from .models import List, ListAlbum, ListLike, Album
from . import db

list_bp = Blueprint("lists", __name__, url_prefix="/api/lists")


def _count_by_list(model, list_ids):
    if not list_ids:
        return {}
    return {
        list_id: int(count or 0)
        for list_id, count in (
            db.session.query(model.list_id, func.count(model.id))
            .filter(model.list_id.in_(list_ids))
            .group_by(model.list_id)
            .all()
        )
    }


def _liked_ids_for_user(user_id):
    if not user_id:
        return set()
    return {
        ll.list_id
        for ll in ListLike.query.filter_by(user_id=user_id).all()
    }


def _serialize_list(
    lst,
    *,
    include_albums=False,
    user_id=None,
    liked_ids=None,
    like_counts=None,
    album_counts=None,
):
    list_id = lst.id
    if liked_ids is None:
        liked_ids = _liked_ids_for_user(user_id)
    if like_counts is None:
        like_counts = _count_by_list(ListLike, [list_id])
    if album_counts is None:
        album_counts = _count_by_list(ListAlbum, [list_id])

    data = lst.to_dict(include_albums=include_albums)
    data["likes"] = like_counts.get(list_id, 0)
    data["albumCount"] = album_counts.get(list_id, 0)
    data["userHasLiked"] = list_id in liked_ids
    return data


@list_bp.route("", methods=["GET"])
def get_lists():
    user_id = session.get("user_id")
    lists = List.query.order_by(List.id).all()
    list_ids = [lst.id for lst in lists]
    liked_ids = _liked_ids_for_user(user_id)
    like_counts = _count_by_list(ListLike, list_ids)
    album_counts = _count_by_list(ListAlbum, list_ids)

    result = []
    for lst in lists:
        result.append(_serialize_list(
            lst,
            liked_ids=liked_ids,
            like_counts=like_counts,
            album_counts=album_counts,
        ))

    return jsonify({"lists": result, "total": len(lists)})


@list_bp.route("/<int:list_id>", methods=["GET"])
def get_list(list_id):
    lst = List.query.get(list_id)
    if not lst:
        return jsonify({"error": "List not found"}), 404
    return jsonify({"list": _serialize_list(
        lst,
        include_albums=True,
        user_id=session.get("user_id"),
    )})


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
    return jsonify({"list": _serialize_list(lst, user_id=creator_user_id)}), 201


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

    db.session.expire(lst, ["list_albums"])
    return jsonify({"list": _serialize_list(
        lst,
        include_albums=True,
        user_id=uid,
    )}), 200


@list_bp.route("/<int:list_id>/like", methods=["POST"])
def toggle_like(list_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Sign in to like a list"}), 401

    lst = db.session.get(List, list_id)
    if not lst:
        return jsonify({"error": "List not found"}), 404

    existing = ListLike.query.filter_by(list_id=list_id, user_id=user_id).first()

    if existing:
        db.session.delete(existing)
        liked = False
    else:
        db.session.add(ListLike(list_id=list_id, user_id=user_id))
        liked = True

    try:
        db.session.flush()
    except IntegrityError:
        # Concurrent duplicate like (same list_id + user_id): return reconciled state.
        db.session.rollback()
        lst = db.session.get(List, list_id)
        if not lst:
            return jsonify({"error": "List not found"}), 404
        like_count = (
            db.session.query(func.count(ListLike.id))
            .filter_by(list_id=list_id)
            .scalar()
            or 0
        )
        lst.like_count = like_count
        db.session.commit()
        return jsonify({"liked": True, "likeCount": like_count})

    like_count = (
        db.session.query(func.count(ListLike.id))
        .filter_by(list_id=list_id)
        .scalar()
        or 0
    )
    lst.like_count = like_count
    db.session.commit()
    return jsonify({"liked": liked, "likeCount": like_count})


@list_bp.route("/<int:list_id>/fork", methods=["POST"])
def fork_list(list_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Sign in to copy a list"}), 401

    source = db.session.get(List, list_id)
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
    return jsonify({"list": _serialize_list(fork, user_id=user_id)}), 201


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

    db.session.expire(lst, ["list_albums"])
    return jsonify({"list": _serialize_list(
        lst,
        include_albums=True,
        user_id=uid,
    )}), 200

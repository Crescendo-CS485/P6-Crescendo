import json

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from .models import User
from . import db

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _request_json() -> dict:
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data

    raw_body = request.get_data(cache=True, as_text=True)
    if raw_body:
        try:
            parsed = json.loads(raw_body)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    return request.form.to_dict()


def _first_present(data: dict, *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        if value is not None:
            return str(value)
    return ""


@auth_bp.route("/register", methods=["POST"])
def register():
    data = _request_json()
    display_name = _first_present(data, "displayName", "display_name", "name").strip()
    handle = _first_present(data, "handle", "username", "userName").strip()
    email = _first_present(data, "email").strip().lower()
    password = _first_present(data, "password")

    missing = []
    if not display_name:
        missing.append("displayName")
    if not handle:
        missing.append("handle")
    if not email:
        missing.append("email")
    if not password:
        missing.append("password")
    if missing:
        return jsonify({
            "error": f"Missing required fields: {', '.join(missing)}",
            "missingFields": missing,
        }), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Normalise handle
    if not handle.startswith("@"):
        handle = f"@{handle}"

    # Check uniqueness
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already in use"}), 400
    if User.query.filter_by(handle=handle).first():
        return jsonify({"error": "Handle already taken"}), 400

    user = User(
        display_name=display_name,
        handle=handle,
        email=email,
        password_hash=generate_password_hash(password),
        is_bot=False,
    )
    db.session.add(user)
    db.session.commit()

    session["user_id"] = user.id
    return jsonify({"user": user.to_dict_auth()}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = _request_json()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401

    session["user_id"] = user.id
    return jsonify({"user": user.to_dict_auth()}), 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route("/me", methods=["GET"])
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"user": None}), 200
    user = User.query.get(user_id)
    if not user:
        session.pop("user_id", None)
        return jsonify({"user": None}), 200
    return jsonify({"user": user.to_dict_auth()}), 200

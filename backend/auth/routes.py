"""Minimal auth.

Spec doesn't require real auth — we just need the agent to know whose
Brain to use. We set a `relix_user_id` cookie on signup/login and read it
on every request via `current_user()`.

Routes:
- POST /api/auth/signup  -> creates User + Planner, sets cookie
- POST /api/auth/login   -> looks up by email + password, sets cookie
- POST /api/auth/logout  -> clears the cookie
- GET  /api/me           -> returns the current user (or 401)
"""
from flask import Blueprint, jsonify, request, make_response

from extensions import db
from models import User, Planner

bp = Blueprint("auth", __name__, url_prefix="/api")


def _set_user_cookie(resp, user_id: int):
    # SameSite=Lax so dev across 5173 <-> 5000 works with credentials:'include'
    resp.set_cookie(
        "relix_user_id",
        str(user_id),
        httponly=True,
        samesite="Lax",
        max_age=60 * 60 * 24 * 30,  # 30 days
    )


def current_user():
    """Look up the User from the cookie. Returns None if missing/invalid."""
    uid = request.cookies.get("relix_user_id")
    if not uid:
        return None
    try:
        return db.session.get(User, int(uid))
    except (ValueError, TypeError):
        return None


def require_user():
    """Convenience for routes: returns (user, None) or (None, 401_response)."""
    user = current_user()
    if user is None:
        return None, (jsonify({"error": "not authenticated"}), 401)
    return user, None


@bp.post("/auth/signup")
def signup():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()
    password = data.get("password") or ""

    if not email or not name or not password:
        return jsonify({"error": "name, email, password are required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email already registered"}), 409

    user = User(
        name=name,
        email=email,
        password=password,
        company_name=data.get("company_name"),
        company_description=data.get("company_description"),
        industry=data.get("industry"),
        target_audience=data.get("target_audience"),
        brand_voice=data.get("brand_voice"),
    )
    db.session.add(user)
    db.session.flush()  # assigns user.id

    planner = Planner(user_id=user.id, name="My Planner")
    db.session.add(planner)
    db.session.commit()

    resp = make_response(jsonify({"user": user.to_dict()}))
    _set_user_cookie(resp, user.id)
    return resp


@bp.post("/auth/login")
def login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or user.password != password:
        return jsonify({"error": "invalid credentials"}), 401

    resp = make_response(jsonify({"user": user.to_dict()}))
    _set_user_cookie(resp, user.id)
    return resp


@bp.post("/auth/logout")
def logout():
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("relix_user_id")
    return resp


@bp.get("/me")
def me():
    user = current_user()
    if user is None:
        return jsonify({"error": "not authenticated"}), 401
    return jsonify({"user": user.to_dict()})

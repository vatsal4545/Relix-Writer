"""Planner endpoints.

- GET  /api/planner            -> planner + blog ideas
- GET  /api/planner/messages   -> chat history (session_id IS NULL)
- POST /api/planner/chat       -> SSE stream of the agent's reply
"""
from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from extensions import db
from models import BlogIdea, Message, Planner
from auth.routes import require_user
from agent.runner import run_agent
from agent.sse import sse_event

bp = Blueprint("planner", __name__, url_prefix="/api/planner")


def _user_planner(user):
    """Return the user's planner, creating one if (somehow) absent."""
    p = Planner.query.filter_by(user_id=user.id).first()
    if p is None:
        p = Planner(user_id=user.id, name="My Planner")
        db.session.add(p)
        db.session.commit()
    return p


@bp.get("")
def get_planner():
    user, err = require_user()
    if err:
        return err
    planner = _user_planner(user)
    ideas = (
        BlogIdea.query.filter_by(planner_id=planner.id)
        .order_by(BlogIdea.created_at.desc())
        .all()
    )
    return jsonify({
        "planner": planner.to_dict(),
        "blog_ideas": [i.to_dict() for i in ideas],
    })


@bp.get("/messages")
def get_messages():
    user, err = require_user()
    if err:
        return err
    msgs = (
        Message.query.filter_by(user_id=user.id)
        .filter(Message.session_id.is_(None))
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    return jsonify({"messages": [m.to_dict() for m in msgs]})


@bp.post("/chat")
def chat():
    user, err = require_user()
    if err:
        return err

    data = request.get_json(force=True) or {}
    user_message = (data.get("message") or "").strip()
    if not user_message:
        return jsonify({"error": "message is required"}), 400

    planner = _user_planner(user)
    app = current_app._get_current_object()

    @stream_with_context
    def generate():
        # Each yielded chunk MUST be inside an app context because the
        # generator runs outside the request after the first yield.
        with app.app_context():
            try:
                for event in run_agent(
                    user=user,
                    planner=planner,
                    user_message=user_message,
                ):
                    yield event
            except Exception as exc:  # last-resort safety net
                yield sse_event("error", {"message": str(exc)})

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

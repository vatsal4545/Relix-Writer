"""Planner endpoints.

- GET  /api/planner            -> planner + blog ideas
- GET  /api/planner/messages   -> chat history (session_id IS NULL)
- POST /api/planner/chat       -> SSE stream of the agent's reply
"""
from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from extensions import db
from models import Artifact, BlogIdea, Message, Planner, Session
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


@bp.delete("/blog_ideas/<int:idea_id>")
def delete_blog_idea(idea_id: int):
    """Delete a blog idea card and cascade to its sessions, messages,
    and artifacts. Only the owner can delete."""
    user, err = require_user()
    if err:
        return err
    idea = db.session.get(BlogIdea, idea_id)
    if idea is None or idea.planner is None or idea.planner.user_id != user.id:
        return jsonify({"error": "blog idea not found"}), 404

    # Find every session attached to this idea, then wipe their child rows
    # (messages + artifacts) before deleting the sessions themselves.
    session_ids = [s.id for s in Session.query.filter_by(blog_idea_id=idea.id).all()]
    if session_ids:
        Message.query.filter(Message.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
        Artifact.query.filter(Artifact.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
        Session.query.filter(Session.id.in_(session_ids)).delete(
            synchronize_session=False
        )

    db.session.delete(idea)
    db.session.commit()
    return jsonify({"ok": True})


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

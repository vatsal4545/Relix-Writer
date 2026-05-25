"""Session endpoints.

- GET    /api/sessions            -> list all of the user's sessions (sidebar)
- POST   /api/sessions            -> create from blog_idea_id
- GET    /api/sessions/:id        -> session + messages + artifacts
- PATCH  /api/sessions/:id        -> manual edits to plan/content/status
- DELETE /api/sessions/:id        -> delete
- POST   /api/sessions/:id/chat   -> SSE stream of agent reply
- GET    /api/messages/:id/dna    -> Message DNA payload (Tier 3 bonus)
"""
from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from extensions import db
from models import Artifact, BlogIdea, Message, Session
from auth.routes import require_user
from agent.runner import run_agent
from agent.sse import sse_event

bp = Blueprint("sessions", __name__, url_prefix="/api")


def _owns_session(user, session: Session) -> bool:
    """Walk session -> blog_idea -> planner -> user."""
    idea = session.blog_idea
    if idea is None:
        return False
    return idea.planner is not None and idea.planner.user_id == user.id


@bp.get("/sessions")
def list_sessions():
    """List every session the current user owns, newest first.
    Joins through blog_idea -> planner -> user so we don't expose other
    users' work. Returns shallow rows (no plan/content bodies) for the
    sidebar — fetch details via GET /api/sessions/:id."""
    user, err = require_user()
    if err:
        return err
    rows = (
        db.session.query(Session, BlogIdea)
        .join(BlogIdea, Session.blog_idea_id == BlogIdea.id)
        .join(BlogIdea.planner)
        .filter(BlogIdea.planner.has(user_id=user.id))
        .order_by(Session.updated_at.desc(), Session.id.desc())
        .all()
    )
    items = [
        {
            "id": s.id,
            "blog_idea_id": s.blog_idea_id,
            "title": idea.title,
            "status": s.status,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s, idea in rows
    ]
    return jsonify({"sessions": items})


@bp.post("/sessions")
def create_session():
    user, err = require_user()
    if err:
        return err
    data = request.get_json(force=True) or {}
    blog_idea_id = data.get("blog_idea_id")
    idea = db.session.get(BlogIdea, blog_idea_id) if blog_idea_id else None
    if idea is None or idea.planner.user_id != user.id:
        return jsonify({"error": "blog idea not found"}), 404

    # Reuse an in-progress session if one already exists for this idea
    existing = (
        Session.query.filter_by(blog_idea_id=idea.id)
        .order_by(Session.created_at.desc())
        .first()
    )
    if existing:
        return jsonify({"session": existing.to_dict(), "blog_idea": idea.to_dict()})

    sess = Session(blog_idea_id=idea.id, status="planning")
    db.session.add(sess)
    idea.status = "in_progress"
    db.session.commit()
    return jsonify({"session": sess.to_dict(), "blog_idea": idea.to_dict()})


@bp.get("/sessions/<int:session_id>")
def get_session(session_id: int):
    user, err = require_user()
    if err:
        return err
    sess = db.session.get(Session, session_id)
    if sess is None or not _owns_session(user, sess):
        return jsonify({"error": "session not found"}), 404

    msgs = (
        Message.query.filter_by(session_id=sess.id, user_id=user.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    artifacts = (
        Artifact.query.filter_by(session_id=sess.id)
        .order_by(Artifact.created_at.asc())
        .all()
    )
    return jsonify({
        "session": sess.to_dict(),
        "blog_idea": sess.blog_idea.to_dict(),
        "messages": [m.to_dict() for m in msgs],
        "artifacts": [a.to_dict() for a in artifacts],
    })


@bp.patch("/sessions/<int:session_id>")
def update_session(session_id: int):
    """Manual edits — satisfies the 'human input' requirement."""
    user, err = require_user()
    if err:
        return err
    sess = db.session.get(Session, session_id)
    if sess is None or not _owns_session(user, sess):
        return jsonify({"error": "session not found"}), 404

    data = request.get_json(force=True) or {}
    if "plan" in data:
        sess.plan = data["plan"]
    if "content" in data:
        sess.content = data["content"]
    if "status" in data:
        sess.status = data["status"]
    db.session.commit()
    return jsonify({"session": sess.to_dict()})


@bp.delete("/sessions/<int:session_id>")
def delete_session(session_id: int):
    user, err = require_user()
    if err:
        return err
    sess = db.session.get(Session, session_id)
    if sess is None or not _owns_session(user, sess):
        return jsonify({"error": "session not found"}), 404

    # Wipe child rows first to keep FK constraints happy.
    Message.query.filter_by(session_id=sess.id).delete()
    Artifact.query.filter_by(session_id=sess.id).delete()
    db.session.delete(sess)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/sessions/<int:session_id>/chat")
def session_chat(session_id: int):
    user, err = require_user()
    if err:
        return err
    sess = db.session.get(Session, session_id)
    if sess is None or not _owns_session(user, sess):
        return jsonify({"error": "session not found"}), 404

    data = request.get_json(force=True) or {}
    user_message = (data.get("message") or "").strip()
    if not user_message:
        return jsonify({"error": "message is required"}), 400

    blog_idea = sess.blog_idea
    app = current_app._get_current_object()

    @stream_with_context
    def generate():
        with app.app_context():
            try:
                for event in run_agent(
                    user=user,
                    session=sess,
                    blog_idea=blog_idea,
                    user_message=user_message,
                ):
                    yield event
            except Exception as exc:
                yield sse_event("error", {"message": str(exc)})

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@bp.get("/messages/<int:message_id>/dna")
def message_dna(message_id: int):
    """Tier 3 bonus: human-readable Message DNA."""
    user, err = require_user()
    if err:
        return err
    msg = db.session.get(Message, message_id)
    if msg is None or msg.user_id != user.id:
        return jsonify({"error": "message not found"}), 404

    ctx = msg.context_used or {}
    brain_labels = {
        "company_name": "your company name",
        "company_description": "what your company does",
        "industry": "your industry",
        "target_audience": "your target audience",
        "brand_voice": "your brand voice",
    }
    pretty_brain = [brain_labels.get(f, f) for f in (ctx.get("brain_fields") or [])]
    return jsonify({
        "message_id": msg.id,
        "raw": ctx,
        "summary": {
            "brain_used": pretty_brain,
            "prior_messages": ctx.get("prior_messages", 0),
            "tools_called": ctx.get("tools_called", []),
            "artifacts_referenced": ctx.get("artifacts_referenced", []),
        },
    })

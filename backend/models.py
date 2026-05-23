"""SQLAlchemy models for Relix.

All models live in this single file so the schema is easy to read in one
pass. Each model exposes a `to_dict()` method that serialises the row into
a plain dict for JSON responses — we keep this explicit rather than using
a marshmallow/pydantic layer so the data shape is obvious at the call site.
"""
from datetime import datetime

from extensions import db


class User(db.Model):
    """A signed-up user. Also stores the "Brain" — the company context
    that gets injected into the agent's system prompt on every call."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    # NOTE: assignment doesn't require real auth. We store a plaintext-ish
    # password just so login is demonstrable. Do NOT ship this for real.
    password = db.Column(db.String(255), nullable=True)

    # --- Brain fields (Tier 2 bonus) ---
    company_name = db.Column(db.String(255))
    company_description = db.Column(db.Text)
    industry = db.Column(db.String(120))
    target_audience = db.Column(db.Text)
    brand_voice = db.Column(db.Text)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    planners = db.relationship("Planner", backref="user", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "company_name": self.company_name,
            "company_description": self.company_description,
            "industry": self.industry,
            "target_audience": self.target_audience,
            "brand_voice": self.brand_voice,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Planner(db.Model):
    """One planner per user. Owns a set of blog ideas (cards in the workspace)
    and a planner-level chat history (messages with session_id NULL)."""

    __tablename__ = "planners"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False, default="My Planner")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    blog_ideas = db.relationship("BlogIdea", backref="planner", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class BlogIdea(db.Model):
    """A blog post idea card in the planner workspace.
    Created by the `create_content_idea` tool. A session is started from one."""

    __tablename__ = "blog_ideas"

    id = db.Column(db.Integer, primary_key=True)
    planner_id = db.Column(db.Integer, db.ForeignKey("planners.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    angle = db.Column(db.Text)
    keywords = db.Column(db.JSON)  # stored as JSONB on Postgres
    status = db.Column(db.String(20), nullable=False, default="idea")  # idea | in_progress | completed
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    sessions = db.relationship("Session", backref="blog_idea", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "planner_id": self.planner_id,
            "title": self.title,
            "description": self.description,
            "angle": self.angle,
            "keywords": self.keywords or [],
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Session(db.Model):
    """A workspace for taking one blog idea to a finished post.
    Holds the editable plan (markdown) and the editable final content."""

    __tablename__ = "sessions"

    id = db.Column(db.Integer, primary_key=True)
    blog_idea_id = db.Column(db.Integer, db.ForeignKey("blog_ideas.id"), nullable=False)
    plan = db.Column(db.Text)
    content = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False, default="planning")
    # planning | plan_ready | executing | completed
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "blog_idea_id": self.blog_idea_id,
            "plan": self.plan,
            "content": self.content,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Message(db.Model):
    """Chat history + agentic memory.
    session_id NULL == planner-level chat. Tool calls get their own row
    (role='tool') so we can replay the loop and render tool chips."""

    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id"), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # user | assistant | tool
    content = db.Column(db.Text)
    tool_name = db.Column(db.String(120))
    tool_input = db.Column(db.JSON)
    tool_output = db.Column(db.JSON)
    # Message DNA (Tier 3 bonus) — what informed this response
    context_used = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "role": self.role,
            "content": self.content,
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "tool_output": self.tool_output,
            "context_used": self.context_used,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Artifact(db.Model):
    """Research storage. Web search results, news articles, notes — anything
    the agent looked at — get pinned here so Message DNA can link back."""

    __tablename__ = "artifacts"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id"), nullable=True)
    type = db.Column(db.String(40), nullable=False)  # research_note | web_search | news_article
    content = db.Column(db.Text, nullable=False)
    source_url = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "type": self.type,
            "content": self.content,
            "source_url": self.source_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

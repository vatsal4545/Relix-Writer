"""Tool schemas + the dispatcher that actually runs them.

Each tool returns a `ToolResult` describing:
- `output`: what gets sent BACK to Claude as the tool_result block
- `is_error`: did the tool fail?
- `artifact_event`: optional SSE payload for the FRONTEND to refresh a
  particular resource (blog ideas list, plan, content, etc.)

We keep the tool catalogue context-aware: planner chat sees
`create_content_idea` but not `execute_plan`, session chat sees the
opposite. This nudges Claude toward the right tool at the right time.
"""
from dataclasses import dataclass, field
from typing import Any, Optional

from extensions import db


# ---------- Tool schemas (sent to Anthropic) ----------

CREATE_CONTENT_IDEA = {
    "name": "create_content_idea",
    "description": (
        "Create a new blog post idea card in the user's planner. "
        "Use when the user is brainstorming what to write about. "
        "Create one card per distinct idea."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Blog post title, max 80 chars"},
            "description": {"type": "string", "description": "2-3 sentence summary"},
            "angle": {"type": "string", "description": "The unique angle or hook"},
            "target_keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Target SEO keywords",
            },
        },
        "required": ["title", "description"],
    },
}

UPDATE_CONTENT_PLAN = {
    "name": "update_content_plan",
    "description": (
        "Write or revise the blog post plan for the current session. "
        "Plan should be a clean markdown outline with sections and bullet points."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "integer"},
            "plan_markdown": {"type": "string", "description": "Full markdown plan"},
            "research_summary": {
                "type": "string",
                "description": "Optional notes on research/sources used",
            },
        },
        "required": ["session_id", "plan_markdown"],
    },
}

EXECUTE_PLAN = {
    "name": "execute_plan",
    "description": (
        "Write the full blog post in markdown using the approved plan. "
        "Call this only after the plan is solid."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "integer"},
        },
        "required": ["session_id"],
    },
}

FIND_TRENDING_TOPICS = {
    "name": "find_trending_topics",
    "description": (
        "Find current trending topics or recent news in an industry. "
        "Use to inform fresh, timely blog ideas."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "industry": {"type": "string"},
            "timeframe": {
                "type": "string",
                "enum": ["this_week", "this_month"],
                "default": "this_week",
            },
        },
        "required": ["industry"],
    },
}

# Anthropic server-side web_search — zero implementation needed
WEB_SEARCH_BUILTIN = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 5,
}


def planner_tools():
    return [CREATE_CONTENT_IDEA, FIND_TRENDING_TOPICS, WEB_SEARCH_BUILTIN]


def session_tools():
    return [UPDATE_CONTENT_PLAN, EXECUTE_PLAN, WEB_SEARCH_BUILTIN]


# ---------- Tool dispatcher ----------

@dataclass
class ToolResult:
    output: Any
    is_error: bool = False
    artifact_event: Optional[dict] = None
    # Side-effects we want to record in context_used / message memory
    extra: dict = field(default_factory=dict)


def execute_tool(name: str, tool_input: dict, *, user, planner=None, session=None, anthropic_client=None) -> ToolResult:
    """Dispatch to the right handler. We import models lazily to avoid
    pulling them in at module import time before db is initialised."""
    from models import BlogIdea, Session, Artifact  # noqa: WPS433

    try:
        if name == "create_content_idea":
            if planner is None:
                return ToolResult({"error": "create_content_idea requires planner context"}, is_error=True)
            idea = BlogIdea(
                planner_id=planner.id,
                title=tool_input.get("title", "Untitled"),
                description=tool_input.get("description"),
                angle=tool_input.get("angle"),
                keywords=tool_input.get("target_keywords") or [],
                status="idea",
            )
            db.session.add(idea)
            db.session.commit()
            return ToolResult(
                output={"created_blog_idea_id": idea.id, "title": idea.title},
                artifact_event={
                    "resource": "blog_ideas",
                    "action": "created",
                    "data": idea.to_dict(),
                },
                extra={"artifact_id": idea.id},
            )

        if name == "update_content_plan":
            session_id = tool_input.get("session_id")
            sess = db.session.get(Session, session_id)
            if sess is None:
                return ToolResult({"error": f"session {session_id} not found"}, is_error=True)
            sess.plan = tool_input.get("plan_markdown", "")
            sess.status = "plan_ready"
            db.session.commit()

            research = tool_input.get("research_summary")
            if research:
                art = Artifact(session_id=sess.id, type="research_note", content=research)
                db.session.add(art)
                db.session.commit()

            return ToolResult(
                output={"updated_session_id": sess.id, "status": sess.status},
                artifact_event={
                    "resource": "session_plan",
                    "action": "updated",
                    "data": {"session_id": sess.id, "plan": sess.plan, "status": sess.status},
                },
            )

        if name == "execute_plan":
            session_id = tool_input.get("session_id")
            sess = db.session.get(Session, session_id)
            if sess is None:
                return ToolResult({"error": f"session {session_id} not found"}, is_error=True)
            if not sess.plan:
                return ToolResult({"error": "session has no plan yet — call update_content_plan first"}, is_error=True)
            if anthropic_client is None:
                return ToolResult({"error": "no anthropic client available"}, is_error=True)

            sess.status = "executing"
            db.session.commit()

            # One-shot generation: feed the plan, ask for the full post.
            blog_idea = sess.blog_idea
            writer_prompt = (
                f"Write a polished blog post in markdown for the brand voice and audience "
                f"of {user.company_name or 'the company'}.\n\n"
                f"Title: {blog_idea.title}\n"
                f"Audience: {user.target_audience or 'general business readers'}\n"
                f"Voice: {user.brand_voice or 'professional, clear'}\n\n"
                f"Use this plan exactly as the outline:\n\n{sess.plan}\n\n"
                f"Return ONLY the blog body in markdown — no preamble, no commentary."
            )
            resp = anthropic_client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=4096,
                messages=[{"role": "user", "content": writer_prompt}],
            )
            full_text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
            sess.content = full_text
            sess.status = "completed"
            blog_idea.status = "completed"
            db.session.commit()

            return ToolResult(
                output={
                    "session_id": sess.id,
                    "content_length": len(full_text),
                    "status": "completed",
                },
                artifact_event={
                    "resource": "session_content",
                    "action": "updated",
                    "data": {
                        "session_id": sess.id,
                        "content": sess.content,
                        "status": sess.status,
                    },
                },
            )

        if name == "find_trending_topics":
            industry = tool_input.get("industry", "")
            timeframe = tool_input.get("timeframe", "this_week")
            # We return a guidance payload telling Claude to use web_search.
            # Claude can then issue a web_search call on its next turn. This
            # keeps the impl simple while still showing intent.
            return ToolResult(
                output={
                    "instruction": (
                        f"Use the web_search tool with query "
                        f"'latest news {industry} {timeframe.replace('_', ' ')}'. "
                        "Summarise the most relevant 3-5 stories."
                    ),
                    "industry": industry,
                    "timeframe": timeframe,
                },
            )

        return ToolResult({"error": f"unknown tool: {name}"}, is_error=True)

    except Exception as exc:  # surface tool crashes back to Claude
        db.session.rollback()
        return ToolResult({"error": str(exc)}, is_error=True)

"""The agentic loop.

A generator that yields SSE events as it goes. The Flask route just
streams whatever this yields. All persistence (messages, context_used)
happens here so the route stays dumb.

Why a loop? Claude can't see a tool's result until you call the API again
with that result in the messages array. So we:
  call -> stream text / record tool_use -> execute tool -> append result
  -> call again -> ... -> stop_reason == 'end_turn'
"""
import os
import random
import time
from typing import Optional

from anthropic import Anthropic
from anthropic import APIStatusError, APIConnectionError, RateLimitError

from extensions import db
from .sse import sse_event
from .system_prompts import (
    build_planner_system_prompt,
    build_session_system_prompt,
)
from .tools import (
    execute_tool,
    planner_tools,
    session_tools,
)


_client: Optional[Anthropic] = None


def get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _client = Anthropic(api_key=api_key)
    return _client


MODEL = "claude-sonnet-4-5-20250929"
MAX_LOOP_ITERATIONS = 8  # safety net against runaway tool use

# Retry policy for transient Anthropic errors (529 overloaded, 503, 5xx, rate limits).
RETRYABLE_STATUS = {429, 500, 502, 503, 504, 529}
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 1.5


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (APIConnectionError, RateLimitError)):
        return True
    if isinstance(exc, APIStatusError):
        return getattr(exc, "status_code", None) in RETRYABLE_STATUS
    return False


def _stream_with_retry(client, *, system_prompt, messages, tools):
    """Open a streaming Claude call, retrying on transient errors with
    exponential backoff + jitter. Yields (chunk, final_response) where
    chunk is a text delta during streaming and final_response is set
    once on the last yield after the stream closes."""
    last_exc: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with client.messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=system_prompt,
                messages=messages,
                tools=tools,
            ) as stream:
                for chunk in stream.text_stream:
                    if chunk:
                        yield chunk, None
                yield None, stream.get_final_message()
                return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt >= MAX_RETRIES or not _is_retryable(exc):
                raise
            sleep_s = BASE_BACKOFF_SECONDS * (2 ** attempt) + random.uniform(0, 0.5)
            time.sleep(sleep_s)
    if last_exc:  # pragma: no cover — defensive
        raise last_exc


def _load_history(user_id: int, *, session_id: Optional[int]):
    """Load prior messages for this chat thread, in chronological order.
    Planner-level chats have session_id IS NULL."""
    from models import Message  # lazy import

    q = Message.query.filter_by(user_id=user_id)
    if session_id is None:
        q = q.filter(Message.session_id.is_(None))
    else:
        q = q.filter_by(session_id=session_id)
    return q.order_by(Message.created_at.asc(), Message.id.asc()).all()


def _history_to_messages(history):
    """Replay stored messages into Anthropic's expected shape.

    We collapse stored rows back into proper assistant turns: a single
    assistant turn can contain text + tool_use blocks, followed by a user
    turn carrying tool_result blocks. We stored each tool call as its own
    'tool' row, so we have to weave them back together.
    """
    msgs = []
    pending_assistant_blocks = []
    pending_tool_results = []

    def flush_assistant():
        nonlocal pending_assistant_blocks
        if pending_assistant_blocks:
            msgs.append({"role": "assistant", "content": pending_assistant_blocks})
            pending_assistant_blocks = []

    def flush_tool_results():
        nonlocal pending_tool_results
        if pending_tool_results:
            msgs.append({"role": "user", "content": pending_tool_results})
            pending_tool_results = []

    for m in history:
        if m.role == "user":
            flush_assistant()
            flush_tool_results()
            msgs.append({"role": "user", "content": m.content or ""})
        elif m.role == "assistant":
            flush_tool_results()
            if m.content:
                pending_assistant_blocks.append({"type": "text", "text": m.content})
        elif m.role == "tool":
            # A tool row implies a preceding tool_use from the assistant.
            # We attach the tool_use block to the current assistant turn,
            # then queue a tool_result for the next user turn.
            tool_use_id = (m.tool_output or {}).get("_tool_use_id") if m.tool_output else None
            tool_use_id = tool_use_id or f"toolu_replay_{m.id}"
            pending_assistant_blocks.append({
                "type": "tool_use",
                "id": tool_use_id,
                "name": m.tool_name,
                "input": m.tool_input or {},
            })
            flush_assistant()
            pending_tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": str(m.tool_output or {}),
            })

    flush_assistant()
    flush_tool_results()
    return msgs


def _build_context_used(user, history, tools_called, artifact_ids):
    """The Message DNA (Tier 3 bonus) payload."""
    brain_fields = [
        f for f in (
            "company_name",
            "company_description",
            "industry",
            "target_audience",
            "brand_voice",
        )
        if getattr(user, f, None)
    ]
    return {
        "brain_fields": brain_fields,
        "prior_messages": len(history),
        "tools_called": tools_called,
        "artifacts_referenced": artifact_ids,
    }


def run_agent(*, user, planner=None, session=None, blog_idea=None, user_message: str):
    """Top-level generator. Yields SSE event strings.

    Exactly ONE of (planner, session) must be provided.
    """
    from models import Message  # lazy import

    if planner is None and session is None:
        raise ValueError("run_agent needs either planner or session")

    session_id = session.id if session else None

    # 1. Save the user's message
    user_msg = Message(
        session_id=session_id,
        user_id=user.id,
        role="user",
        content=user_message,
    )
    db.session.add(user_msg)
    db.session.commit()

    # 2. Build history + system prompt + tools
    history = _load_history(user.id, session_id=session_id)
    messages = _history_to_messages(history)
    messages.append({"role": "user", "content": user_message})

    if session is not None:
        system_prompt = build_session_system_prompt(user, session, blog_idea)
        tools = session_tools()
    else:
        system_prompt = build_planner_system_prompt(user)
        tools = planner_tools()

    client = get_client()
    tools_called_log = []
    artifact_ids = []
    final_text_chunks = []

    try:
        for _ in range(MAX_LOOP_ITERATIONS):
            # Stream tokens out of Claude as they arrive so the UI sees
            # text appear progressively instead of in one big chunk.
            # _stream_with_retry handles transient 529/5xx/rate-limits.
            response = None
            for chunk, final in _stream_with_retry(
                client,
                system_prompt=system_prompt,
                messages=messages,
                tools=tools,
            ):
                if chunk is not None:
                    yield sse_event("text", {"delta": chunk})
                if final is not None:
                    response = final
            if response is None:
                raise RuntimeError("Claude stream ended without a final message")

            assistant_blocks = []
            tool_result_blocks_for_next_turn = []

            for block in response.content:
                btype = getattr(block, "type", None)

                if btype == "text":
                    # Text was already streamed above; just record it for
                    # history + final persistence. Do NOT re-yield.
                    assistant_blocks.append({"type": "text", "text": block.text})
                    final_text_chunks.append(block.text)

                elif btype == "tool_use":
                    yield sse_event("tool_use_start", {
                        "tool_name": block.name,
                        "tool_use_id": block.id,
                    })
                    yield sse_event("tool_use_input", {
                        "tool_use_id": block.id,
                        "input": block.input,
                    })

                    result = execute_tool(
                        block.name,
                        block.input or {},
                        user=user,
                        planner=planner,
                        session=session,
                        anthropic_client=client,
                    )

                    yield sse_event("tool_result", {
                        "tool_use_id": block.id,
                        "output": result.output,
                        "is_error": result.is_error,
                    })
                    if result.artifact_event:
                        yield sse_event("artifact_update", result.artifact_event)

                    # Persist the tool call as its own row
                    tool_row = Message(
                        session_id=session_id,
                        user_id=user.id,
                        role="tool",
                        tool_name=block.name,
                        tool_input=block.input or {},
                        tool_output={**(result.output if isinstance(result.output, dict) else {"output": result.output}),
                                     "_tool_use_id": block.id, "_is_error": result.is_error},
                    )
                    db.session.add(tool_row)
                    db.session.commit()

                    tools_called_log.append({
                        "name": block.name,
                        "input": block.input,
                    })
                    if "artifact_id" in result.extra:
                        artifact_ids.append(result.extra["artifact_id"])

                    assistant_blocks.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
                    tool_result_blocks_for_next_turn.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result.output),
                        **({"is_error": True} if result.is_error else {}),
                    })

                elif btype == "server_tool_use":
                    # Anthropic's built-in web_search runs server-side.
                    # Surface the query so the user sees WHAT we're searching.
                    raw_input = getattr(block, "input", {}) or {}
                    if hasattr(raw_input, "model_dump"):
                        raw_input = raw_input.model_dump()
                    elif not isinstance(raw_input, dict):
                        raw_input = dict(raw_input)
                    server_id = getattr(block, "id", "server")
                    yield sse_event("tool_use_start", {
                        "tool_name": getattr(block, "name", "web_search"),
                        "tool_use_id": server_id,
                        "server_side": True,
                    })
                    yield sse_event("tool_use_input", {
                        "tool_use_id": server_id,
                        "input": raw_input,
                    })
                    assistant_blocks.append({
                        "type": "server_tool_use",
                        "id": server_id,
                        "name": getattr(block, "name", None),
                        "input": raw_input,
                    })
                    tools_called_log.append({
                        "name": getattr(block, "name", "web_search"),
                        "input": raw_input,
                        "server_side": True,
                    })

                elif btype == "web_search_tool_result":
                    # Result from the server-side web_search. Extract a
                    # citation-shaped list (title/url/snippet) so the UI can
                    # render real links, and persist each result as an
                    # Artifact for Message DNA back-references.
                    from models import Artifact  # lazy

                    raw_content = getattr(block, "content", None)
                    results_payload = []
                    error_payload = None

                    def _get(item, key):
                        """Read a field whether item is an SDK object or dict."""
                        if isinstance(item, dict):
                            return item.get(key)
                        return getattr(item, key, None)

                    if isinstance(raw_content, list):
                        for item in raw_content:
                            if _get(item, "type") == "web_search_result":
                                results_payload.append({
                                    "title": _get(item, "title"),
                                    "url": _get(item, "url"),
                                    "page_age": _get(item, "page_age"),
                                })
                    elif raw_content is not None and _get(raw_content, "type") == "web_search_tool_result_error":
                        error_payload = {"error_code": _get(raw_content, "error_code") or "unknown"}

                    # Persist results as Artifacts so Message DNA can link back.
                    new_artifacts = []
                    for r in results_payload:
                        if r.get("url"):
                            art = Artifact(
                                session_id=session_id,
                                type="web_search",
                                content=r.get("title") or r["url"],
                                source_url=r["url"],
                            )
                            db.session.add(art)
                            new_artifacts.append(art)
                    if new_artifacts:
                        db.session.commit()
                        artifact_ids.extend(a.id for a in new_artifacts)

                    tool_use_id = getattr(block, "tool_use_id", "server")
                    yield sse_event("tool_result", {
                        "tool_use_id": tool_use_id,
                        "output": {
                            "results": results_payload,
                            "result_count": len(results_payload),
                            "error": error_payload,
                        },
                        "is_error": error_payload is not None,
                    })

                    assistant_blocks.append({
                        "type": "web_search_tool_result",
                        "tool_use_id": tool_use_id,
                        "content": raw_content,
                    })

            messages.append({"role": "assistant", "content": assistant_blocks})

            if response.stop_reason == "tool_use" and tool_result_blocks_for_next_turn:
                messages.append({"role": "user", "content": tool_result_blocks_for_next_turn})
                continue

            # No more tools — done
            break

        # 3. Persist the assistant message (final text) with context_used
        final_text = "".join(final_text_chunks)
        context_used = _build_context_used(user, history, tools_called_log, artifact_ids)

        assistant_msg = Message(
            session_id=session_id,
            user_id=user.id,
            role="assistant",
            content=final_text,
            context_used=context_used,
        )
        db.session.add(assistant_msg)
        db.session.commit()

        yield sse_event("done", {
            "assistant_message_id": assistant_msg.id,
            "context_used": context_used,
        })

    except APIStatusError as exc:
        db.session.rollback()
        status = getattr(exc, "status_code", None)
        if status == 529 or status == 503:
            msg = "Claude is overloaded right now. Please try again in a moment."
        elif status == 429:
            msg = "Rate limit hit. Please wait a few seconds and retry."
        else:
            msg = f"Claude API error ({status}). Please try again."
        yield sse_event("error", {"message": msg, "status": status, "retryable": True})
    except APIConnectionError:
        db.session.rollback()
        yield sse_event("error", {
            "message": "Couldn't reach Claude. Check your network and retry.",
            "retryable": True,
        })
    except Exception as exc:
        db.session.rollback()
        yield sse_event("error", {"message": str(exc)})

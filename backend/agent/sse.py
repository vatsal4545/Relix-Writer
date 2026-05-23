"""Tiny SSE event formatter.

The SSE wire format is just `event: <name>\ndata: <json>\n\n`. We keep
this helper trivial so the runner can call `yield sse_event("text", {...})`
without thinking about framing.
"""
import json


def sse_event(event: str, data) -> str:
    """Format a single SSE event. `data` is JSON-encoded."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

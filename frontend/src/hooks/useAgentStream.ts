/**
 * useAgentStream — the React side of the agentic loop.
 *
 * It POSTs the user's message to an SSE endpoint, then reads the
 * `event: ... / data: ...` frames out of the streaming response body.
 * Every frame updates local chat state. `artifact_update` frames also
 * invalidate React Query caches so the workspace refetches live.
 *
 * Why fetch + ReadableStream instead of EventSource?
 *   EventSource is GET-only and can't send a JSON body. We need POST.
 */
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AgentEvent,
  ChatMessage,
  ContextUsed,
  ToolCall,
} from '../api/types';

interface SendOptions {
  endpoint: string;
  body: Record<string, unknown>;
  // Which React Query keys to invalidate when artifact_update fires.
  // Map resource -> queryKey to refetch.
  resourceQueryKeys?: Record<string, unknown[]>;
}

interface UseAgentStreamResult {
  messages: ChatMessage[];
  streaming: boolean;
  send: (opts: SendOptions, userText: string) => Promise<void>;
  reset: (initial?: ChatMessage[]) => void;
}

function tempId() {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`;
}

export function useAgentStream(): UseAgentStreamResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const queryClient = useQueryClient();
  // We need a stable reference to "the assistant message currently being built"
  // because state updates inside the read loop can race otherwise.
  const currentAssistantIdRef = useRef<string | null>(null);

  const reset = useCallback((initial: ChatMessage[] = []) => {
    setMessages(initial);
  }, []);

  const send = useCallback(
    async ({ endpoint, body, resourceQueryKeys }: SendOptions, userText: string) => {
      const userMsg: ChatMessage = {
        id: tempId(),
        role: 'user',
        content: userText,
        toolCalls: [],
      };
      const assistantId = tempId();
      currentAssistantIdRef.current = assistantId;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        streaming: true,
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setStreaming(true);

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by a blank line.
          let blankIdx = buffer.indexOf('\n\n');
          while (blankIdx !== -1) {
            const raw = buffer.slice(0, blankIdx);
            buffer = buffer.slice(blankIdx + 2);
            const parsed = parseSseFrame(raw);
            if (parsed) handleEvent(parsed, assistantId, queryClient, resourceQueryKeys || {}, setMessages);
            blankIdx = buffer.indexOf('\n\n');
          }
        }
      } catch (err: any) {
        setMessages((all) =>
          all.map((m) =>
            m.id === assistantId
              ? { ...m, content: (m.content || '') + `\n\n[error: ${err.message || err}]`, streaming: false }
              : m
          )
        );
      } finally {
        setMessages((all) =>
          all.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
        );
        setStreaming(false);
        currentAssistantIdRef.current = null;
      }
    },
    [queryClient]
  );

  return { messages, streaming, send, reset };
}

function parseSseFrame(raw: string): AgentEvent | null {
  let event = '';
  let dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event) return null;
  const dataStr = dataLines.join('\n');
  try {
    return { event, data: dataStr ? JSON.parse(dataStr) : {} } as AgentEvent;
  } catch {
    return null;
  }
}

function handleEvent(
  evt: AgentEvent,
  assistantId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  resourceQueryKeys: Record<string, unknown[]>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) {
  switch (evt.event) {
    case 'text': {
      const delta = evt.data.delta || '';
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId ? { ...m, content: (m.content || '') + delta } : m
        )
      );
      break;
    }
    case 'tool_use_start': {
      const newCall: ToolCall = {
        tool_use_id: evt.data.tool_use_id,
        tool_name: evt.data.tool_name,
        status: 'running',
        server_side: evt.data.server_side,
      };
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId ? { ...m, toolCalls: [...m.toolCalls, newCall] } : m
        )
      );
      break;
    }
    case 'tool_use_input': {
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                toolCalls: m.toolCalls.map((t) =>
                  t.tool_use_id === evt.data.tool_use_id ? { ...t, input: evt.data.input } : t
                ),
              }
            : m
        )
      );
      break;
    }
    case 'tool_result': {
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                toolCalls: m.toolCalls.map((t) =>
                  t.tool_use_id === evt.data.tool_use_id
                    ? {
                        ...t,
                        status: evt.data.is_error ? 'error' : 'done',
                        output: evt.data.output,
                      }
                    : t
                ),
              }
            : m
        )
      );
      break;
    }
    case 'artifact_update': {
      const { resource } = evt.data;
      const key = resourceQueryKeys[resource];
      if (key) queryClient.invalidateQueries({ queryKey: key });
      // Forward as a window event so non-React-Query consumers (session
      // plan/content editors) can react without re-fetching.
      window.dispatchEvent(new CustomEvent('relix:artifact', { detail: evt.data }));
      break;
    }
    case 'done': {
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                id: evt.data.assistant_message_id,
                streaming: false,
                context_used: evt.data.context_used,
              }
            : m
        )
      );
      break;
    }
    case 'error': {
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId
            ? { ...m, content: (m.content || '') + `\n\n[error: ${evt.data.message}]`, streaming: false }
            : m
        )
      );
      break;
    }
  }
}

// Helper to convert persisted MessageRows into ChatMessage shape on load.
export function historyToChatMessages(
  rows: Array<{
    id: number;
    role: 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_name?: string | null;
    tool_input?: any;
    tool_output?: any;
    context_used?: ContextUsed | null;
  }>
): ChatMessage[] {
  const out: ChatMessage[] = [];
  let lastAssistant: ChatMessage | null = null;

  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ id: r.id, role: 'user', content: r.content || '', toolCalls: [] });
      lastAssistant = null;
    } else if (r.role === 'assistant') {
      const msg: ChatMessage = {
        id: r.id,
        role: 'assistant',
        content: r.content || '',
        toolCalls: lastAssistant ? lastAssistant.toolCalls : [],
        context_used: r.context_used,
      };
      if (lastAssistant) {
        // Replace the placeholder assistant we created for tool rows
        out[out.length - 1] = msg;
      } else {
        out.push(msg);
      }
      lastAssistant = msg;
    } else if (r.role === 'tool') {
      // Append to the most recent assistant (creating a placeholder if missing)
      if (!lastAssistant) {
        lastAssistant = { id: `tool_anchor_${r.id}`, role: 'assistant', content: '', toolCalls: [] };
        out.push(lastAssistant);
      }
      const toolUseId = (r.tool_output && r.tool_output._tool_use_id) || `replay_${r.id}`;
      const isErr = r.tool_output && r.tool_output._is_error;
      lastAssistant.toolCalls.push({
        tool_use_id: toolUseId,
        tool_name: r.tool_name || 'tool',
        input: r.tool_input || undefined,
        output: r.tool_output,
        status: isErr ? 'error' : 'done',
      });
    }
  }
  return out;
}

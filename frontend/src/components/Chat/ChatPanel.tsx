import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ToolCallChip from './ToolCallChip';
import ContextDNAPopover from './ContextDNAPopover';
import type { ChatMessage } from '../../api/types';

interface Props {
  title: string;
  emptyHint: string;
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
}

export default function ChatPanel({ title, emptyHint, messages, streaming, onSend, onStop, disabled }: Props) {
  const [input, setInput] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, streaming]);

  function send() {
    const text = input.trim();
    if (!text || streaming || disabled) return;
    setInput('');
    onSend(text);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-panel">
      <div className="workspace-header" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2>{title}</h2>
        <div className="hint">Press Enter to send · Shift+Enter for newline</div>
      </div>
      <div className="chat-messages" ref={scrollerRef}>
        {messages.length === 0 && (
          <div className="chat-empty">{emptyHint}</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.toolCalls.length > 0 && m.role === 'assistant' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                {m.toolCalls.map((c) => <ToolCallChip key={c.tool_use_id} call={c} />)}
              </div>
            )}
            {(m.content || m.streaming) && (
              <div className="msg-bubble">
                {m.content ? (
                  m.role === 'assistant' ? (
                    <div className="markdown-render chat-markdown">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )
                ) : (
                  <span>
                    <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
                  </span>
                )}
              </div>
            )}
            {m.role === 'assistant' && !m.streaming && m.context_used && (
              <div className="msg-meta">
                <ContextDNAPopover context={m.context_used} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-bar">
        <textarea
          placeholder={disabled ? 'Disabled' : 'Talk to Relix…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled || streaming}
          rows={2}
        />
        {streaming && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="chat-stop-btn"
            title="Stop generating"
          >
            Stop
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim() || streaming || disabled}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}

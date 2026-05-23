import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../../api/client';

interface Props {
  sessionId: number;
  content: string;
  onSaved: (content: string) => void;
}

export default function ContentTab({ sessionId, content, onSaved }: Props) {
  const [draft, setDraft] = useState(content || '');
  const [editing, setEditing] = useState(false);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    setDraft(content || '');
  }, [content]);

  async function save() {
    setSavingState('saving');
    await api(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: draft }),
    });
    onSaved(draft);
    setSavingState('saved');
    setEditing(false);
    setTimeout(() => setSavingState('idle'), 1500);
  }

  if (!content && !editing) {
    return (
      <div className="edit-area">
        <div className="empty-state">
          <div style={{ fontSize: 28, marginBottom: 8 }}>✍️</div>
          The blog post hasn't been written yet.<br />
          Approve the plan, then ask Relix to <em>"write the post"</em>.
        </div>
        <div className="actions">
          <button onClick={() => setEditing(true)}>Write manually</button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="edit-area">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="actions">
          <span className="save-status">
            {savingState === 'saving' ? 'Saving…' : savingState === 'saved' ? 'Saved.' : ''}
          </span>
          <button className="secondary" onClick={() => { setDraft(content); setEditing(false); }}>Cancel</button>
          <button onClick={save}>Save content</button>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-area">
      <div className="markdown-render" style={{ flex: 1, overflowY: 'auto' }}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      <div className="actions">
        <button className="secondary" onClick={() => setEditing(true)}>Edit content</button>
      </div>
    </div>
  );
}

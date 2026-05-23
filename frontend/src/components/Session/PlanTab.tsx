import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../../api/client';

interface Props {
  sessionId: number;
  plan: string;
  onSaved: (plan: string) => void;
}

export default function PlanTab({ sessionId, plan, onSaved }: Props) {
  const [draft, setDraft] = useState(plan || '');
  const [editing, setEditing] = useState(false);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    setDraft(plan || '');
  }, [plan]);

  async function save() {
    setSavingState('saving');
    await api(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ plan: draft }),
    });
    onSaved(draft);
    setSavingState('saved');
    setEditing(false);
    setTimeout(() => setSavingState('idle'), 1500);
  }

  if (!plan && !editing) {
    return (
      <div className="edit-area">
        <div className="empty-state">
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          No plan yet. Ask Relix to draft one, or write one yourself.
        </div>
        <div className="actions">
          <button onClick={() => setEditing(true)}>Start writing manually</button>
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
          <button className="secondary" onClick={() => { setDraft(plan); setEditing(false); }}>Cancel</button>
          <button onClick={save}>Save plan</button>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-area">
      <div className="markdown-render" style={{ flex: 1, overflowY: 'auto' }}>
        <ReactMarkdown>{plan}</ReactMarkdown>
      </div>
      <div className="actions">
        <button className="secondary" onClick={() => setEditing(true)}>Edit plan</button>
      </div>
    </div>
  );
}

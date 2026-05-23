import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BlogIdea, MessageRow, SessionRow } from '../api/types';
import TopBar from '../components/TopBar';
import ChatPanel from '../components/Chat/ChatPanel';
import PlanTab from '../components/Session/PlanTab';
import ContentTab from '../components/Session/ContentTab';
import { useAgentStream, historyToChatMessages } from '../hooks/useAgentStream';

interface SessionDetail {
  session: SessionRow;
  blog_idea: BlogIdea;
  messages: MessageRow[];
  artifacts: any[];
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const qc = useQueryClient();
  const { messages, streaming, send, reset } = useAgentStream();
  const [tab, setTab] = useState<'plan' | 'content'>('plan');
  // Local mirrors of plan/content so live SSE updates render instantly
  // without a refetch round-trip.
  const [plan, setPlan] = useState('');
  const [content, setContent] = useState('');

  const detail = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api<SessionDetail>(`/api/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  // Seed chat + plan/content from server fetch
  useEffect(() => {
    if (!detail.data) return;
    setPlan(detail.data.session.plan || '');
    setContent(detail.data.session.content || '');
    reset(historyToChatMessages(detail.data.messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.session.id]);

  // Live SSE updates: bump local mirrors when artifact_update fires.
  useEffect(() => {
    function onArtifact(e: Event) {
      const ce = e as CustomEvent;
      const { resource, data } = ce.detail || {};
      if (resource === 'session_plan' && data?.session_id === sessionId) {
        setPlan(data.plan || '');
        setTab('plan');
        qc.invalidateQueries({ queryKey: ['session', sessionId] });
      } else if (resource === 'session_content' && data?.session_id === sessionId) {
        setContent(data.content || '');
        setTab('content');
        qc.invalidateQueries({ queryKey: ['session', sessionId] });
      }
    }
    window.addEventListener('relix:artifact', onArtifact);
    return () => window.removeEventListener('relix:artifact', onArtifact);
  }, [sessionId, qc]);

  function onSend(text: string) {
    send(
      {
        endpoint: `/api/sessions/${sessionId}/chat`,
        body: { message: text },
        resourceQueryKeys: { session_plan: ['session', sessionId], session_content: ['session', sessionId] },
      },
      text
    );
  }

  if (detail.isLoading) {
    return (
      <div className="with-topbar">
        <TopBar />
        <div className="empty-state">Loading session…</div>
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="with-topbar">
        <TopBar />
        <div className="empty-state">
          Session not found. <Link to="/planner">Back to planner</Link>
        </div>
      </div>
    );
  }

  const { blog_idea, session } = detail.data;

  return (
    <div className="with-topbar">
      <TopBar
        left={
          <Link to="/planner" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            ← Back to planner
          </Link>
        }
      />
      <div className="body">
        <ChatPanel
          title={blog_idea.title}
          emptyHint="Discuss the post. Ask Relix to draft a plan, then to write the full post."
          messages={messages}
          streaming={streaming}
          onSend={onSend}
        />
        <div className="workspace-panel">
          <div className="workspace-header">
            <h2>{blog_idea.title}</h2>
            <div className="hint">
              status: {session.status.replace('_', ' ')} · idea: {blog_idea.angle || '(no angle yet)'}
            </div>
          </div>
          <div className="tabs">
            <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>Plan</button>
            <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>Content</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {tab === 'plan' ? (
              <PlanTab sessionId={sessionId} plan={plan} onSaved={(p) => setPlan(p)} />
            ) : (
              <ContentTab sessionId={sessionId} content={content} onSaved={(c) => setContent(c)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

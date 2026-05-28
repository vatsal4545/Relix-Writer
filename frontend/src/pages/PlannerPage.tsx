import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BlogIdea, MessageRow } from '../api/types';
import TopBar from '../components/TopBar';
import ChatPanel from '../components/Chat/ChatPanel';
import BlogIdeaCard from '../components/Planner/BlogIdeaCard';
import { useAgentStream, historyToChatMessages } from '../hooks/useAgentStream';

type StatusFilter = 'all' | 'idea' | 'in_progress' | 'completed';
type SortOrder = 'newest' | 'oldest' | 'status';

export default function PlannerPage() {
  const { messages, streaming, send, stop, reset } = useAgentStream();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const planner = useQuery({
    queryKey: ['planner'],
    queryFn: () => api<{ planner: any; blog_ideas: BlogIdea[] }>('/api/planner'),
  });

  const history = useQuery({
    queryKey: ['planner-messages'],
    queryFn: () => api<{ messages: MessageRow[] }>('/api/planner/messages'),
  });

  // Seed chat from server history exactly once when it loads.
  useEffect(() => {
    if (history.data && messages.length === 0) {
      reset(historyToChatMessages(history.data.messages));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data]);

  function onSend(text: string) {
    send(
      {
        endpoint: '/api/planner/chat',
        body: { message: text },
        resourceQueryKeys: { blog_ideas: ['planner'] },
      },
      text
    );
  }

  const ideas = planner.data?.blog_ideas || [];
  const empty = useMemo(() => ideas.length === 0, [ideas.length]);

  // Counts per status — drive the filter pills and refresh live as
  // new cards stream in via SSE artifact_update.
  const counts = useMemo(() => {
    const c = { all: ideas.length, idea: 0, in_progress: 0, completed: 0 };
    for (const i of ideas) {
      if (i.status in c) (c as any)[i.status] += 1;
    }
    return c;
  }, [ideas]);

  // Filter by search query (across title / description / angle / keywords)
  // and by status, then sort. Pure client-side — no extra requests.
  const filteredIdeas = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = ideas.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        i.title,
        i.description || '',
        i.angle || '',
        ...(i.keywords || []),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (sortOrder === 'oldest') {
      list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else if (sortOrder === 'status') {
      // idea -> in_progress -> completed, then newest first within each
      const rank: Record<string, number> = { idea: 0, in_progress: 1, completed: 2 };
      list = [...list].sort((a, b) => {
        const r = (rank[a.status] ?? 99) - (rank[b.status] ?? 99);
        return r !== 0 ? r : b.created_at.localeCompare(a.created_at);
      });
    }
    // 'newest' is already the server default; no extra sort needed.
    return list;
  }, [ideas, query, statusFilter, sortOrder]);

  const filtersActive = query.trim() !== '' || statusFilter !== 'all';
  const noMatches = !empty && filteredIdeas.length === 0;

  return (
    <div className="with-topbar">
      <TopBar />
      <div className="body">
        <ChatPanel
          title="Planner Chat"
          emptyHint={
            "Hi! Tell me what you'd like to write about. I'll brainstorm ideas\n" +
            "and add them to your workspace as I go."
          }
          messages={messages}
          streaming={streaming}
          onSend={onSend}
          onStop={stop}
        />
        <div className="workspace-panel">
          <div className="workspace-header">
            <h2>Blog ideas</h2>
            <div className="hint">
              {empty
                ? 'No ideas yet — start chatting on the left.'
                : filtersActive
                  ? `${filteredIdeas.length} of ${ideas.length} shown`
                  : `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} in your planner`}
            </div>
          </div>

          {!empty && (
            <div className="ideas-toolbar">
              <input
                className="ideas-search"
                type="text"
                placeholder="Search ideas…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="status-pills">
                {(['all', 'idea', 'in_progress', 'completed'] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    className={`status-pill ${statusFilter === s ? 'active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === 'all' ? 'All' : s.replace('_', ' ')} <span className="pill-count">{counts[s]}</span>
                  </button>
                ))}
              </div>
              <select
                className="sort-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                title="Sort order"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="status">By status</option>
              </select>
            </div>
          )}

          <div className="workspace-body">
            {empty ? (
              <div className="empty-state">
                <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                Ask Relix to brainstorm. Try:<br />
                <em style={{ color: 'var(--text)' }}>"Give me 3 blog ideas about AI agents."</em>
              </div>
            ) : noMatches ? (
              <div className="empty-state">
                No ideas match your filter.{' '}
                <button
                  className="secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => { setQuery(''); setStatusFilter('all'); }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="ideas-grid">
                {filteredIdeas.map((i) => <BlogIdeaCard key={i.id} idea={i} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

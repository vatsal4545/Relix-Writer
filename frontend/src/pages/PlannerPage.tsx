import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BlogIdea, MessageRow } from '../api/types';
import TopBar from '../components/TopBar';
import ChatPanel from '../components/Chat/ChatPanel';
import BlogIdeaCard from '../components/Planner/BlogIdeaCard';
import { useAgentStream, historyToChatMessages } from '../hooks/useAgentStream';

export default function PlannerPage() {
  const { messages, streaming, send, reset } = useAgentStream();

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
        />
        <div className="workspace-panel">
          <div className="workspace-header">
            <h2>Blog ideas</h2>
            <div className="hint">
              {empty ? 'No ideas yet — start chatting on the left.' : `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} in your planner`}
            </div>
          </div>
          <div className="workspace-body">
            {empty ? (
              <div className="empty-state">
                <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                Ask Relix to brainstorm. Try:<br />
                <em style={{ color: 'var(--text)' }}>"Give me 3 blog ideas about AI agents."</em>
              </div>
            ) : (
              <div className="ideas-grid">
                {ideas.map((i) => <BlogIdeaCard key={i.id} idea={i} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

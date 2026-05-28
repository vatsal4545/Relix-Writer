import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { BlogIdea, SessionRow } from '../../api/types';

export default function BlogIdeaCard({ idea }: { idea: BlogIdea }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startSession = useMutation({
    mutationFn: async () => {
      return api<{ session: SessionRow }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ blog_idea_id: idea.id }),
      });
    },
    onSuccess: (res) => {
      // Prime the sidebar so the new session appears immediately
      qc.invalidateQueries({ queryKey: ['sessions-list'] });
      navigate(`/sessions/${res.session.id}`);
    },
  });

  const deleteIdea = useMutation({
    mutationFn: async () =>
      api<{ ok: true }>(`/api/planner/blog_ideas/${idea.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      // Refresh planner (cards) and sessions sidebar (any sessions were
      // cascade-deleted too).
      qc.invalidateQueries({ queryKey: ['planner'] });
      qc.invalidateQueries({ queryKey: ['sessions-list'] });
    },
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleteIdea.isPending) return;
    const ok = window.confirm(
      `Delete "${idea.title}"? This also removes any sessions and chat history attached to it.`
    );
    if (!ok) return;
    deleteIdea.mutate();
  }

  return (
    <div className="idea-card">
      <button
        type="button"
        className="idea-card-delete"
        title="Delete idea"
        aria-label="Delete idea"
        onClick={handleDelete}
        disabled={deleteIdea.isPending}
      >
        ×
      </button>
      <h3>{idea.title}</h3>
      {idea.description && <div className="desc">{idea.description}</div>}
      {idea.angle && <div className="angle">Angle: {idea.angle}</div>}
      {idea.keywords && idea.keywords.length > 0 && (
        <div className="kw">
          {idea.keywords.map((k, i) => <span key={i}>{k}</span>)}
        </div>
      )}
      <div><span className={`status ${idea.status}`}>{idea.status.replace('_', ' ')}</span></div>
      <button onClick={() => startSession.mutate()} disabled={startSession.isPending}>
        {startSession.isPending ? 'Opening…' : idea.status === 'completed' ? 'Open session' : 'Start session →'}
      </button>
    </div>
  );
}

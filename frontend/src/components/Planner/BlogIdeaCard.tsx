import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { BlogIdea, SessionRow } from '../../api/types';

export default function BlogIdeaCard({ idea }: { idea: BlogIdea }) {
  const navigate = useNavigate();
  const startSession = useMutation({
    mutationFn: async () => {
      return api<{ session: SessionRow }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ blog_idea_id: idea.id }),
      });
    },
    onSuccess: (res) => navigate(`/sessions/${res.session.id}`),
  });

  return (
    <div className="idea-card">
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

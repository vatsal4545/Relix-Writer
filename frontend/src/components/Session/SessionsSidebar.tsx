import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface SidebarSession {
  id: number;
  blog_idea_id: number;
  title: string;
  status: string;
  updated_at: string | null;
}

/**
 * Left rail listing every session the user has started.
 * Matches the spec wireframe: planner header + a vertical stack of
 * session entries with the active one highlighted.
 */
export default function SessionsSidebar({ activeId }: { activeId?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sessions-list'],
    queryFn: () => api<{ sessions: SidebarSession[] }>('/api/sessions'),
    staleTime: 10_000,
  });

  const sessions = data?.sessions || [];

  return (
    <aside className="sessions-sidebar">
      <div className="sidebar-header">
        <Link to="/planner" className="sidebar-planner-link">
          Planner
        </Link>
        <div className="sidebar-hint">All sessions</div>
      </div>
      <div className="sidebar-list">
        {isLoading && <div className="sidebar-empty">Loading…</div>}
        {!isLoading && sessions.length === 0 && (
          <div className="sidebar-empty">
            No sessions yet. Start one from the planner.
          </div>
        )}
        {sessions.map((s) => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className={`sidebar-item ${s.id === activeId ? 'active' : ''}`}
            title={s.title}
          >
            <div className="sidebar-item-title">{s.title}</div>
            <div className={`sidebar-item-status status-${s.status}`}>
              {s.status.replace('_', ' ')}
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}

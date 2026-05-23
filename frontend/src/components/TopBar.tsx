import { useNavigate } from 'react-router-dom';
import { useUser, useLogout } from '../hooks/useUser';

export default function TopBar({ left }: { left?: React.ReactNode }) {
  const { data: user } = useUser();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="brand" onClick={() => navigate('/planner')} style={{ cursor: 'pointer' }}>
          <span className="accent">Relix</span> the Writer
        </div>
        {left}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {user && (
          <>
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {user.name} · <em>{user.company_name || 'no company'}</em>
            </span>
            <button
              className="secondary"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

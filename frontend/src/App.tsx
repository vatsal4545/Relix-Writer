import { Navigate, Route, Routes } from 'react-router-dom';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import PlannerPage from './pages/PlannerPage';
import SessionPage from './pages/SessionPage';
import { useUser } from './hooks/useUser';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useUser();
  if (isLoading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/signup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/planner"
        element={
          <ProtectedRoute>
            <PlannerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions/:id"
        element={
          <ProtectedRoute>
            <SessionPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/planner" replace />} />
    </Routes>
  );
}

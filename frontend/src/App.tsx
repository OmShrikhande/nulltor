import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { IDEPage } from './pages/IDEPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SystemUsersPage } from './pages/SystemUsersPage';
import { ToastContainer } from './components/shared/Toast';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/logs" element={<ProtectedRoute><AuditLogsPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><SystemUsersPage /></ProtectedRoute>} />
        <Route path="/ide/:projectId" element={<ProtectedRoute><IDEPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <ToastContainer />
    </HashRouter>
  );
}

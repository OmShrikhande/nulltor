import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { ThemeProvider } from './context/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { IDEPage } from './pages/IDEPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SystemUsersPage } from './pages/SystemUsersPage';
import { SettingsPage } from './pages/SettingsPage';
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
    <ThemeProvider>
      <div className="global-bg-wrapper" />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><AuditLogsPage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><SystemUsersPage /></ProtectedRoute>} />
          <Route path="/ide/:projectId" element={<ProtectedRoute><IDEPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastContainer />
      </HashRouter>
    </ThemeProvider>
  );
}

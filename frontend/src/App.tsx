import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from './components/shared/Toast';
import { NulltorLogo } from './components/shared/NulltorLogo';
import { InteractiveBackground } from './components/shared/InteractiveBackground';

// Code-split pages for instant initial bundle loading
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const IDEPage = lazy(() => import('./pages/IDEPage').then(m => ({ default: m.IDEPage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
const SystemUsersPage = lazy(() => import('./pages/SystemUsersPage').then(m => ({ default: m.SystemUsersPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

function PageLoader() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <NulltorLogo size="md" />
      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
        <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #3b82f6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <span>Loading workspace...</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (window.location.pathname && window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      const cleanPath = window.location.pathname;
      window.history.replaceState(null, '', `/#${cleanPath}`);
    }
    hydrate();
  }, [hydrate]);

  return (
    <ThemeProvider>
      <InteractiveBackground />
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
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
        </Suspense>
        <ToastContainer />
      </HashRouter>
    </ThemeProvider>
  );
}

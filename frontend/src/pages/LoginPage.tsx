import { Navigate } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { ForcePasswordChange } from '../components/auth/ForcePasswordChange';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const { isAuthenticated, user, logout } = useAuthStore();

  if (isAuthenticated && user?.requires_password_change) {
    return <ForcePasswordChange onSuccess={logout} />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginForm onSuccess={() => window.location.hash = '/dashboard'} />;
}

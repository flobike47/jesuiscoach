import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { signedIn } = useAuth();
  const location = useLocation();

  if (!signedIn) return <Navigate to="/connexion" state={{ from: location }} replace />;
  return <>{children}</>;
}

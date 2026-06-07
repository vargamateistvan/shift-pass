import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, restoring } = useAuth();
  if (restoring) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

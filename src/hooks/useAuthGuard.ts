// ─── useAuthGuard Hook ────────────────────────────────────────────────────────
// Protects pages that require authentication.
// Redirects to /auth/login if no active session.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function useAuthGuard(redirectTo = "/auth/login"): void {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, loading, navigate, redirectTo]);
}

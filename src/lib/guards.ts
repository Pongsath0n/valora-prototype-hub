// ─── Admin Session Guard ──────────────────────────────────────────────────────
// Simple localStorage-based session for demo/prototype.
// TODO: Replace with JWT / server-side session in production.

const ADMIN_SESSION_KEY = "valora:admin_session";
const ADMIN_PASSWORD = "admin2025"; // hardcoded for demo only

/**
 * Checks whether the current session has admin privileges.
 * Returns true if the admin session flag is set in localStorage.
 */
export function isAdminLoggedIn(): boolean {
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Attempts admin login with the provided password.
 * Returns true if successful.
 */
export function adminLogin(password: string): boolean {
  if (password === ADMIN_PASSWORD) {
    localStorage.setItem(ADMIN_SESSION_KEY, "1");
    return true;
  }
  return false;
}

/**
 * Clears the admin session.
 */
export function adminLogout(): void {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

// ─── React Guard Hook ─────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * React hook: redirects to /admin/login if not authenticated as admin.
 * Place at the top of any admin page component.
 *
 * @example
 * function AdminPage() {
 *   useAdminGuard();
 *   return <div>Admin content</div>;
 * }
 */
export function useAdminGuard(redirectTo = "/admin/login"): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAdminLoggedIn()) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);
}

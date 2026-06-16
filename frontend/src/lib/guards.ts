import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileRole } from "@/contexts/RoleContext";
import { supabase } from "@/lib/supabase";

export type AppRole = "owner" | "admin" | "manager" | "staff" | null;

export function useRoleGuard(allowedRoles?: AppRole[]) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useProfileRole();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (authLoading || roleLoading) {
      setChecking(true);
      return;
    }

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    setChecking(false);

    if (allowedRoles && !allowedRoles.includes(role)) {
      setAccessDenied(true);
    } else {
      setAccessDenied(false);
    }
  }, [authLoading, roleLoading, user, navigate, allowedRoles, role]);

  return { checking, role, accessDenied };
}

export async function adminLogout() {
  await supabase.auth.signOut();
}

/** Roles allowed to access store-admin routes (/admin/*). */
const MANAGER_ROLES: AppRole[] = ["owner", "admin", "manager"];

export const STORE_MANAGER_ROLES = MANAGER_ROLES;

export const STORE_ADMIN_ROLES: AppRole[] = [...MANAGER_ROLES, "staff"];

/** Roles allowed to access business portal routes (/app/*). */
export const BUSINESS_PORTAL_ROLES = MANAGER_ROLES;

/**
 * Roles allowed to access the internal system console (/system/*).
 *
 * TODO: introduce a dedicated `internal_system` (or platform staff) role once
 * the role model supports it. For now we restrict to `owner` so the console
 * is not exposed to store-level admins or staff.
 */
export const SYSTEM_CONSOLE_ROLES: AppRole[] = ["owner"];

/** Convenience guard for store-admin routes. */
export function useAdminGuard() {
  return useRoleGuard(STORE_ADMIN_ROLES);
}

/** Convenience guard for store management-only routes. */
export function useManagerGuard() {
  return useRoleGuard(STORE_MANAGER_ROLES);
}

/** Convenience guard for business portal routes. */
export function useBusinessGuard() {
  return useRoleGuard(BUSINESS_PORTAL_ROLES);
}

/** Convenience guard for the internal system console. */
export function useSystemGuard() {
  return useRoleGuard(SYSTEM_CONSOLE_ROLES);
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type AppRole = "owner" | "admin" | "manager" | "staff" | null;

type GuardProfile = { id: string; email: string | null; role: AppRole; store_id?: string | null };

export function useRoleGuard(allowedRoles: AppRole[]) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const normalizedAllowedRoles = useMemo(() => allowedRoles.map((r) => (r ?? "").toLowerCase()), [allowedRoles]);

  useEffect(() => {
    if (authLoading) return;
    setAccessDenied(false);
    setChecking(true);

    if (!user) {
      navigate("/client-access", { replace: true });
      return;
    }

    supabase.from("profiles").select("id,email,role,store_id").eq("id", user.id).maybeSingle().then(({ data, error }) => {
      const profile = (data as GuardProfile | null) ?? null;
      const profileRole = (profile?.role ?? null) as AppRole;
      const normalizedProfileRole = (profileRole ?? "").toLowerCase();
      setRole(profileRole);
      if (error || !profile || !normalizedAllowedRoles.includes(normalizedProfileRole)) setAccessDenied(true);
      setChecking(false);
    }).catch(() => {
      setAccessDenied(true);
      setChecking(false);
    });
  }, [authLoading, user, navigate, normalizedAllowedRoles]);

  return { checking, role, accessDenied };
}

export const useAdminGuard = () => useRoleGuard(["owner", "admin"]);
export const useDashboardGuard = () => useRoleGuard(["owner", "admin", "manager", "staff"]);

export async function adminLogout() { await supabase.auth.signOut(); }

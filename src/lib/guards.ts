import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type AppRole = "owner" | "admin" | "manager" | "staff" | null;

type GuardProfile = { id: string; email: string | null; role: AppRole; store_id?: string | null };

export function useRoleGuard(allowedRoles: Exclude<AppRole, null>[]) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [accessDenied, setAccessDenied] = useState(false);
<<<<<<< HEAD

  const allowedRolesKey = useMemo(
    () => allowedRoles.map((role) => role.toLowerCase()).join("|"),
    [allowedRoles]
  );

  useEffect(() => {
    let isMounted = true;
=======
  const normalizedAllowedRoles = useMemo(() => allowedRoles.map((r) => (r ?? "").toLowerCase()), [allowedRoles]);

  useEffect(() => {
    if (authLoading) return;
    setAccessDenied(false);
    setChecking(true);
>>>>>>> 05d3e1cc11ef4d33f1ef03ba749c6a6c61c47a96

    async function checkAccess() {
      if (authLoading) return;

<<<<<<< HEAD
      setChecking(true);
      setAccessDenied(false);
      setRole(null);

      if (!user) {
        navigate("/client-access", { replace: true });
        return;
      }

      const normalizedAllowedRoles = allowedRolesKey
        .split("|")
        .filter(Boolean);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      const profile = (data as GuardProfile | null) ?? null;
      const profileRole = profile?.role ?? null;
      const normalizedProfileRole = (profileRole ?? "").toLowerCase();

      if (import.meta.env.DEV) {
        console.log("[useRoleGuard]", {
          authUserId: user.id,
          authEmail: user.email ?? null,
          profileId: profile?.id ?? null,
          profileEmail: profile?.email ?? null,
          profileRole,
          storeId: profile?.store_id ?? null,
          allowedRoles: normalizedAllowedRoles,
          error,
        });
      }

      setRole(profileRole);

      if (error || !profile) {
        setAccessDenied(true);
        setChecking(false);
        return;
      }

      const isAllowed = normalizedAllowedRoles.includes(
        normalizedProfileRole
      );

      setAccessDenied(!isAllowed);
      setChecking(false);
    }

    checkAccess();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user?.id, user?.email, navigate, allowedRolesKey]);
=======
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
>>>>>>> 05d3e1cc11ef4d33f1ef03ba749c6a6c61c47a96

  return { checking, role, accessDenied };
}

export const useAdminGuard = () => useRoleGuard(["owner", "admin"]);
export const useDashboardGuard = () => useRoleGuard(["owner", "admin", "manager", "staff"]);

<<<<<<< HEAD
export function useDashboardGuard() {
  return useRoleGuard(["owner", "admin", "manager", "staff"]);
}

export async function adminLogout() {
  await supabase.auth.signOut();
}
=======
export async function adminLogout() { await supabase.auth.signOut(); }
>>>>>>> 05d3e1cc11ef4d33f1ef03ba749c6a6c61c47a96

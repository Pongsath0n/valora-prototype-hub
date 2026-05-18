import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type AppRole = "owner" | "admin" | "manager" | "staff" | null;

export function useRoleGuard(allowedRoles?: AppRole[]) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/client-access", { replace: true });
      return;
    }

    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const profileRole = (data?.role ?? null) as AppRole;
        setRole(profileRole);

        if (allowedRoles && !allowedRoles.includes(profileRole)) {
          setAccessDenied(true);
        }
        setChecking(false);
      })
      .catch(() => {
        setAccessDenied(true);
        setChecking(false);
      });
  }, [authLoading, user, navigate, allowedRoles]);

  return { checking, role, accessDenied };
}

export async function adminLogout() {
  await supabase.auth.signOut();
}

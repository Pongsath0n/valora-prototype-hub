// ─── Admin Guards ─────────────────────────────────────────────────────────────
// Role-based admin access via Supabase Auth + profiles.role column.
// Replaces the old hardcoded password approach.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

/** Check if the currently logged-in user has admin role */
export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role === "admin";
}

/** Hook that redirects non-admin users away from admin pages */
export function useAdminGuard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/admin/login", { replace: true });
      return;
    }

    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.role !== "admin") {
          navigate("/admin/login", { replace: true });
        } else {
          setIsAdminUser(true);
        }
        setChecking(false);
      });
  }, [user, authLoading, navigate]);

  return { checking, isAdminUser };
}

/** Admin logout — signs out from Supabase entirely */
export async function adminLogout() {
  await supabase.auth.signOut();
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storeAdminApi } from "@/services/storeAdminApi";
import type { AppRole } from "@/lib/guards";
import { useAuth } from "@/contexts/AuthContext";

interface RoleContextValue {
  role: AppRole;
  loading: boolean;
  refreshRole: () => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchRole() {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const me = await storeAdminApi.getMe();
        if (cancelled) return;
        setRole((me.role ?? null) as AppRole);
      } catch (_) {
        if (cancelled) return;
        setRole(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!authLoading) {
      void fetchRole();
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, refreshIndex]);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      loading,
      refreshRole: () => setRefreshIndex((idx) => idx + 1),
    }),
    [role, loading],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useProfileRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useProfileRole must be used within RoleProvider");
  }
  return ctx;
}

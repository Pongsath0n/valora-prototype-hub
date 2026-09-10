import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storeAdminApi } from "@/services/storeAdminApi";
import type { AppRole } from "@/lib/guards";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Canonical role model (Backend Contract V1).
 *
 * The backend distinguishes two role layers:
 *
 * 1. `profileRole` — from `profiles.role`. Authorizes platform/system access
 *    (System Console: owner/admin). This is NOT a store-tenant role.
 *
 * 2. `currentStoreRole` — from `store_members.role` for the resolved store.
 *    Authorizes tenant/store operations (owner/manager/staff). Owner-only
 *    store actions (e.g. cancellation) MUST check `currentStoreRole === "owner"`,
 *    NOT `profileRole`.
 *
 * These MUST NOT be conflated. Example:
 *   profileRole = "admin" (System Console operator)
 *   currentStoreRole = "manager" (store tenant manager)
 *   → System Console: ALLOWED
 *   → Manager operations: ALLOWED
 *   → Owner-only store cancellation: DENIED
 *
 * The existing `role` field is preserved as `profileRole` for backward
 * compatibility with current guards, but new V1 code should use the explicit
 * `profileRole` and `currentStoreRole` accessors.
 */
interface RoleContextValue {
  /** Profile role from `profiles.role` — platform/system authorization. */
  profileRole: AppRole;
  /**
   * Store role from `store_members.role` for the resolved store membership.
   * Authorizes tenant/store operations. `null` when no membership is resolved.
   */
  currentStoreRole: AppRole;
  /** Resolved store id from the first membership (V1 single-store). */
  storeId: string | null;
  /** Resolved store name from the store record. */
  storeName: string | null;
  loading: boolean;
  refreshRole: () => void;
  /**
   * @deprecated Use `profileRole` or `currentStoreRole` explicitly.
   * Kept for backward compatibility with existing guards that check
   * profile role for store-admin route access.
   */
  role: AppRole;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profileRole, setProfileRole] = useState<AppRole>(null);
  const [currentStoreRole, setCurrentStoreRole] = useState<AppRole>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchRole() {
      if (!user) {
        setProfileRole(null);
        setCurrentStoreRole(null);
        setStoreId(null);
        setStoreName(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const me = await storeAdminApi.getMe();
        if (cancelled) return;
        const resolvedProfileRole = (me.role ?? null) as AppRole;
        setProfileRole(resolvedProfileRole);
        setStoreId(me.store_id ?? null);
        setStoreName(me.store_name ?? null);

        // Derive the current store role from the first matching membership.
        // V1 ships with a single pre-provisioned store; the backend resolves
        // the canonical store id server-side. We pick the membership whose
        // store_id matches the resolved store_id (or the first membership as
        // a fallback for non-Healholic deployments).
        const memberships = me.memberships ?? [];
        const resolvedStoreId = me.store_id;
        const matching = resolvedStoreId
          ? memberships.find((m) => String(m.store_id) === String(resolvedStoreId))
          : memberships[0];
        setCurrentStoreRole((matching?.role ?? null) as AppRole);
      } catch (_) {
        if (cancelled) return;
        setProfileRole(null);
        setCurrentStoreRole(null);
        setStoreId(null);
        setStoreName(null);
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
      profileRole,
      currentStoreRole,
      storeId,
      storeName,
      loading,
      refreshRole: () => setRefreshIndex((idx) => idx + 1),
      // Backward-compat: existing guards read `role` as the profile role.
      role: profileRole,
    }),
    [profileRole, currentStoreRole, storeId, storeName, loading],
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

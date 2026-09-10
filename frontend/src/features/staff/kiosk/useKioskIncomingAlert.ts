import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  storeAdminApi,
  type IncomingQueueOrder,
} from "@/services/storeAdminApi";
import { useProfileRole } from "@/contexts/RoleContext";
import { useStoreOrdersRealtimeInvalidation } from "@/hooks/useStoreOrdersRealtimeInvalidation";

/**
 * Canonical V1 polling interval (ms). Matches Staff Incoming Queue.
 */
const POLL_INTERVAL_MS = 15_000;

/**
 * Aggregated notice shown either on initial load (when pending orders
 * already exist) or when new order ids appear on a later refresh.
 *
 * - kind "initial": "มีออเดอร์ออนไลน์รออยู่ N รายการ" (one aggregated notice,
 *   NOT one popup per existing order).
 * - kind "new": "มีออเดอร์ออนไลน์ใหม่ N รายการ" (one aggregated notice for
 *   all new ids detected in a single refresh).
 */
export type KioskIncomingNotice = {
  kind: "initial" | "new";
  count: number;
};

function parseCreatedAt(order: IncomingQueueOrder): number {
  if (!order.created_at) return 0;
  const t = Date.parse(order.created_at);
  return Number.isFinite(t) ? t : 0;
}

function friendlyQueueError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m === "missing_token" || m === "invalid_token" || m === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (m === "store_access_denied" || m === "no_store_membership" || m === "store_mismatch") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (m === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการเข้าถึงคิวออเดอร์";
  }
  if (m === "network" || m === "fetch_failed") {
    return "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง";
  }
  if (m.includes("supabase") || m.includes("postgres") || m.includes("fastapi") || m.includes("stack")) {
    return "ไม่สามารถโหลดคิวออเดอร์ได้ในขณะนี้ กรุณาลองอีกครั้ง";
  }
  return message || "ไม่สามารถโหลดคิวออเดอร์ได้ในขณะนี้ กรุณาลองอีกครั้ง";
}

/**
 * useKioskIncomingAlert
 *
 * PF-03: Kiosk-side operational VIEW of the canonical Incoming Queue.
 *
 * Source of truth: `GET /api/store-admin/orders/incoming` via
 * `storeAdminApi.listIncomingQueue()`. This hook does NOT create orders,
 * does NOT duplicate the Incoming Queue engine, and does NOT use
 * `listOrders`, `listPayments`, or direct Supabase business CRUD.
 *
 * Behavior:
 * - Fetches the canonical Incoming Queue immediately on mount.
 * - Polls every 15 seconds (consistent with Staff Incoming Queue).
 * - Prevents overlapping requests via an in-flight guard + dirty follow-up.
 * - On initial load: if pending orders already exist, shows ONE aggregated
 *   initial notice (NOT one popup per existing order).
 * - On later refreshes: detects new orders by canonical `order.id` only
 *   (never customer_name / order_no / array index / created_at alone).
 *   Multiple new ids in one refresh produce ONE aggregated notice.
 * - Existing ids never re-notify.
 * - On fetch failure during refresh: retains the previously valid snapshot
 *   (does NOT clear it). Kiosk Walk-in operations remain usable.
 * - Realtime invalidation (FE-08) MAY trigger a canonical refetch when the
 *   feature flag is enabled (default false). Realtime payload is NEVER
 *   treated as data — invalidation only. Polling remains the fallback.
 */
export function useKioskIncomingAlert() {
  const [orders, setOrders] = useState<IncomingQueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<KioskIncomingNotice | null>(null);

  const inFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  // In-memory previous/seen id set for new-order detection by canonical id.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Whether the initial fetch has completed (so subsequent fetches detect
  // "new" ids rather than treating everything as initial).
  const initializedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { storeId } = useProfileRole();

  const fetchQueue = useCallback(async (isInitial: boolean) => {
    if (inFlightRef.current) {
      // Mark dirty so the in-flight fetch schedules a follow-up.
      dirtyRef.current = true;
      return;
    }
    inFlightRef.current = true;
    if (isInitial) setLoading(true);
    try {
      const response = await storeAdminApi.listIncomingQueue();
      // Deduplicate by canonical order.id; preserve backend FIFO order.
      const seen = new Set<string>();
      const deduped: IncomingQueueOrder[] = [];
      for (const order of response.orders ?? []) {
        if (!order?.id || seen.has(order.id)) continue;
        seen.add(order.id);
        deduped.push(order);
      }

      const currentIds = new Set(deduped.map((o) => o.id));

      if (isInitial) {
        // Initial load: seed seen-ids. Show ONE aggregated notice if pending
        // orders already exist — NOT one popup per existing order.
        seenIdsRef.current = currentIds;
        initializedRef.current = true;
        if (deduped.length > 0) {
          setNotice({ kind: "initial", count: deduped.length });
        }
      } else {
        // Subsequent refresh: detect new ids by canonical order.id only.
        const newIds = deduped
          .map((o) => o.id)
          .filter((id) => !seenIdsRef.current.has(id));
        if (newIds.length > 0) {
          // ONE aggregated notice for all new ids in this refresh.
          setNotice({ kind: "new", count: newIds.length });
          newIds.forEach((id) => seenIdsRef.current.add(id));
        }
      }

      setOrders(deduped);
      setError(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      if (isInitial) {
        // Initial failure: no prior snapshot to retain.
        setOrders([]);
        setError(friendlyQueueError(raw));
      }
      // Refresh failure: retain previously valid snapshot (do NOT clear).
      // Kiosk Walk-in operations remain usable; polling continues.
    } finally {
      inFlightRef.current = false;
      if (isInitial) setLoading(false);
      // If an invalidation arrived during this fetch, schedule exactly one
      // follow-up canonical refetch.
      if (dirtyRef.current) {
        dirtyRef.current = false;
        void fetchQueue(false);
      }
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    void fetchQueue(true);
  }, [fetchQueue]);

  // Polling: every 15 seconds. Timer resets after each fetch result so we
  // never stack timers, and never poll faster than 15s.
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollTimerRef.current = setTimeout(() => {
      void fetchQueue(false);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchQueue, orders]);

  // Realtime invalidation (FE-08): invalidation-only, gated by feature flag
  // (default false). Realtime payload is NEVER treated as data. Polling
  // remains the canonical fallback.
  const handleRealtimeInvalidation = useCallback(() => {
    void fetchQueue(false);
  }, [fetchQueue]);
  useStoreOrdersRealtimeInvalidation(storeId, handleRealtimeInvalidation);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const refetch = useCallback(() => {
    void fetchQueue(false);
  }, [fetchQueue]);

  // Oldest waiting time derived from canonical created_at (display only).
  // Does NOT change backend FIFO order.
  const oldestWaitMs = useMemo(() => {
    if (orders.length === 0) return 0;
    const now = Date.now();
    let oldest = Infinity;
    for (const o of orders) {
      const t = parseCreatedAt(o);
      if (t > 0 && t < oldest) oldest = t;
    }
    return oldest === Infinity ? 0 : Math.max(0, now - oldest);
  }, [orders]);

  return {
    orders,
    count: orders.length,
    loading,
    error,
    notice,
    dismissNotice,
    refetch,
    oldestWaitMs,
  };
}

export type UseKioskIncomingAlert = ReturnType<typeof useKioskIncomingAlert>;

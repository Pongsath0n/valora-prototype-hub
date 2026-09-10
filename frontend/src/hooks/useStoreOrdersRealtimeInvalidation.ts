import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { featureFlags } from "@/config/featureFlags";

/**
 * useStoreOrdersRealtimeInvalidation
 *
 * Canonical V1 Staff Realtime queue invalidation hook (FE-08).
 *
 * Architecture: Realtime is an INVALIDATION TRIGGER only — never a data
 * source. When an `orders` INSERT/UPDATE event arrives for the active
 * store, the hook debounces/coalesces the event and invokes the supplied
 * `onInvalidate` callback. The owning queue decides which canonical REST
 * endpoint to refetch (`listIncomingQueue` or `listProductionQueue`).
 *
 * Safety properties:
 * - Subscription is gated by `featureFlags.enableStoreOrdersRealtime`
 *   (default false). When disabled, no channel is created and the hook
 *   is a no-op — polling remains the source of truth.
 * - Subscription requires a non-empty `storeId`. Fail closed: never
 *   subscribe without a store filter.
 * - Subscription uses the existing browser Supabase client (anon key).
 *   No privileged backend credential, no second client, no business CRUD/RPC.
 * - Realtime payload is treated as a signal only. It is never logged,
 *   never persisted, never inserted into queue state, never rendered.
 * - Channel is cleaned up on unmount and when `storeId` changes.
 * - Realtime failure (CHANNEL_ERROR / TIMED_OUT / CLOSED) does NOT
 *   break the queue UI — polling remains the canonical fallback.
 *
 * Debounce: 300ms coalescing window. Multiple near-simultaneous events
 * produce a single `onInvalidate` callback.
 *
 * Dirty/follow-up behavior: the hook does not perform the refetch itself.
 * The owning queue is responsible for in-flight fetch guarding and for
 * scheduling a follow-up fetch if an invalidation arrives during an
 * in-flight REST request. The hook simply calls `onInvalidate()` once
 * per coalesced burst.
 *
 * @param storeId  Active store id from RoleContext. When null/empty, no
 *                 subscription is created.
 * @param onInvalidate  Callback invoked once per coalesced event burst.
 *                       Must be stable (e.g. useCallback) to avoid
 *                       resubscribing on every render.
 */
export function useStoreOrdersRealtimeInvalidation(
  storeId: string | null,
  onInvalidate: () => void,
): void {
  // Keep latest callback in a ref so we don't resubscribe when only the
  // callback identity changes.
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  // Debounce timer ref (per active subscription).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fail closed if feature flag is off or storeId is missing.
    if (!featureFlags.enableStoreOrdersRealtime) return;
    if (!storeId || storeId.length === 0) return;

    // Build a stable channel name keyed by storeId so React StrictMode /
    // remounts don't accumulate duplicate channels for the same store.
    const channelName = `store-orders-invalidations:${storeId}`;

    // Defensive: remove any pre-existing channel with the same name to
    // avoid duplicates if a previous cleanup raced.
    try {
      supabase.channel(channelName).unsubscribe();
    } catch {
      // Ignore — best-effort cleanup.
    }

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          // Payload is treated as signal only — never logged or stored.
          scheduleInvalidation();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          scheduleInvalidation();
        },
      )
      .subscribe((status) => {
        // Status values: SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED.
        // On failure, polling remains the canonical fallback. Do NOT
        // clear queue data, disable polling, or build a reconnect loop.
        // Noisy production logging is intentionally avoided.
        if (import.meta.env?.DEV && status === "CHANNEL_ERROR") {
          // Development-only diagnostic — no PII, no payload.
          console.debug("[realtime] store-orders channel error — polling fallback active");
        }
      });

    function scheduleInvalidation() {
      // Coalesce near-simultaneous events into a single callback.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onInvalidateRef.current();
      }, 300);
    }

    return () => {
      // Cleanup: cancel pending debounce and remove the channel.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      try {
        supabase.channel(channelName).unsubscribe();
      } catch {
        // Ignore — best-effort cleanup.
      }
    };
  }, [storeId]);
}

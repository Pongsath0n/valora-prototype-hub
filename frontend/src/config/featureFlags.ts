export const featureFlags = {
  /** Show yellow Store Admin banner describing the E2E training route */
  showE2EHints: (import.meta.env.VITE_SHOW_E2E_HINTS ?? "false") === "true",
  /** Exposes testing-only manual LINE user-id binding controls in the customer page */
  enableManualLineBinding: (import.meta.env.VITE_ENABLE_MANUAL_LINE_BINDING ?? "false") === "true",
  /**
   * Staff Realtime queue invalidation (FE-08).
   *
   * When true, the Incoming/Production queues subscribe to
   * `public.orders` INSERT/UPDATE events scoped to the active store
   * and use them as an invalidation trigger for a canonical REST
   * refetch. Polling (15s) remains the source-of-truth fallback.
   *
   * Default: false. Realtime infrastructure (orders publication +
   * store-scoped RLS) must be verified on the Supabase project before
   * enabling in Production. The hook fails closed (no subscription)
   * when disabled, so queues continue to operate via polling.
   */
  enableStoreOrdersRealtime:
    (import.meta.env.VITE_ENABLE_STORE_ORDERS_REALTIME ?? "false") === "true",
} as const;

export type FeatureFlags = typeof featureFlags;

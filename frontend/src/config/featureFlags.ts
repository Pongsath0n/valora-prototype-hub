export const featureFlags = {
  /** Show yellow Store Admin banner describing the E2E training route */
  showE2EHints: (import.meta.env.VITE_SHOW_E2E_HINTS ?? "false") === "true",
  /** Exposes testing-only manual LINE user-id binding controls in the customer page */
  enableManualLineBinding: (import.meta.env.VITE_ENABLE_MANUAL_LINE_BINDING ?? "false") === "true",
} as const;

export type FeatureFlags = typeof featureFlags;

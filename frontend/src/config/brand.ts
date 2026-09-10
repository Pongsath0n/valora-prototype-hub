/**
 * Centralized brand identity for Healholic V1.
 *
 * Canonical branding:
 * - Platform / system = "Valora" (system console, login, internal tooling).
 * - Store / customer-facing = "Healholic" (customer ordering flow, receipts).
 *
 * Legacy "Brewway" MUST NOT appear in customer-facing UI.
 *
 * TODO(future): when the backend exposes a public store-name contract for
 * the customer surface, replace this constant with a tenant-derived value.
 * Until then, this single deployment-level constant is the canonical source
 * for the customer-facing store display name so hardcoded strings are not
 * scattered across components.
 */
export const PLATFORM_NAME = "Valora";

export const STORE_DISPLAY_NAME = "Healholic";

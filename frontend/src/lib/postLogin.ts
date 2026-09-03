import type { AppRole } from "@/lib/guards";

/**
 * Pure post-login redirect resolver.
 *
 * Healholic V1 alignment:
 * - The Healholic store is pre-provisioned, so generic onboarding is NOT part
 *   of the customer flow. The `hasOnboarded` localStorage flag is intentionally
 *   ignored for Healholic post-login routing. The parameter is retained for
 *   backward compatibility with any caller and with existing tests, but it no
 *   longer gates the owner redirect.
 * - Staff land directly on the POS kiosk (/staff/kiosk), the operational
 *   direct-sale workspace.
 * - Owner / admin / manager land on the business dashboard (/owner/dashboard).
 */
export function resolvePostLoginRoute(role: AppRole | string | null, hasOnboarded: boolean): string {
  void hasOnboarded; // Healholic store is pre-provisioned; onboarding is bypassed.
  if (role === "staff") return "/staff/kiosk";
  return "/owner/dashboard";
}

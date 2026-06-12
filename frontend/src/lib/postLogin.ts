import type { AppRole } from "@/lib/guards";

/**
 * Pure post-login redirect resolver.
 *
 * - Users who have not completed onboarding go to /onboarding first.
 * - Staff land on the operational workspace (/store-admin).
 * - Owner / admin / manager land on the business dashboard (/app/dashboard),
 *   where Profit Planning (/app/planning) is the primary entry point.
 */
export function resolvePostLoginRoute(role: AppRole | string | null, hasOnboarded: boolean): string {
  if (!hasOnboarded) return "/onboarding";
  if (role === "staff") return "/store-admin";
  return "/app/dashboard";
}

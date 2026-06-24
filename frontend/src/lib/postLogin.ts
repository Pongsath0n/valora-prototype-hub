import type { AppRole } from "@/lib/guards";

/**
 * Pure post-login redirect resolver.
 *
 * - Staff ALWAYS land on the operational workspace (/store-admin) regardless of
 *   the onboarding flag. The onboarding flow is an owner setup wizard that ends
 *   on /app/dashboard (a business-portal route staff cannot access), so routing
 *   staff through it caused an Access Denied bounce on a fresh browser where the
 *   localStorage `hasOnboarded` flag is absent. Role is therefore checked first.
 * - Owner / admin / manager who have not completed onboarding go to /onboarding.
 * - Owner / admin / manager who have onboarded land on the business dashboard
 *   (/app/dashboard), where Profit Planning (/app/planning) is the primary entry.
 */
export function resolvePostLoginRoute(role: AppRole | string | null, hasOnboarded: boolean): string {
  if (role === "staff") return "/staff";
  if (!hasOnboarded) return "/onboarding";
  return "/owner/dashboard";
}

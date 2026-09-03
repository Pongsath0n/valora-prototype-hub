import { describe, expect, it } from "vitest";
import { resolvePostLoginRoute } from "./postLogin";

describe("resolvePostLoginRoute", () => {
  it("sends owner to the business dashboard", () => {
    expect(resolvePostLoginRoute("owner", true)).toBe("/owner/dashboard");
  });

  it("sends admin and manager to the business dashboard", () => {
    expect(resolvePostLoginRoute("admin", true)).toBe("/owner/dashboard");
    expect(resolvePostLoginRoute("manager", true)).toBe("/owner/dashboard");
  });

  it("sends staff to the POS kiosk workspace", () => {
    expect(resolvePostLoginRoute("staff", true)).toBe("/staff/kiosk");
  });

  it("never sends staff to owner routes", () => {
    const route = resolvePostLoginRoute("staff", true);
    expect(route).not.toMatch(/^\/owner\//);
    expect(route).not.toMatch(/^\/system/);
  });

  it("Healholic V1 bypasses onboarding for owners (store is pre-provisioned)", () => {
    // The hasOnboarded flag is intentionally ignored in Healholic V1.
    expect(resolvePostLoginRoute("owner", false)).toBe("/owner/dashboard");
    expect(resolvePostLoginRoute("admin", false)).toBe("/owner/dashboard");
  });

  it("staff never route through onboarding regardless of flag", () => {
    expect(resolvePostLoginRoute("staff", false)).toBe("/staff/kiosk");
  });
});

import { describe, expect, it } from "vitest";
import { resolvePostLoginRoute } from "./postLogin";

describe("resolvePostLoginRoute", () => {
  it("sends owner to the business dashboard", () => {
    expect(resolvePostLoginRoute("owner", true)).toBe("/app/dashboard");
  });

  it("sends admin and manager to the business dashboard", () => {
    expect(resolvePostLoginRoute("admin", true)).toBe("/app/dashboard");
    expect(resolvePostLoginRoute("manager", true)).toBe("/app/dashboard");
  });

  it("sends staff to the operational workspace", () => {
    expect(resolvePostLoginRoute("staff", true)).toBe("/store-admin");
  });

  it("never sends staff to owner routes", () => {
    const route = resolvePostLoginRoute("staff", true);
    expect(route).not.toMatch(/^\/app\//);
    expect(route).not.toMatch(/^\/system/);
  });

  it("routes non-onboarded users to onboarding first", () => {
    expect(resolvePostLoginRoute("owner", false)).toBe("/onboarding");
    expect(resolvePostLoginRoute("staff", false)).toBe("/onboarding");
  });
});

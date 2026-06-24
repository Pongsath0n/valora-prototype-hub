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

  it("sends staff to the operational workspace", () => {
    expect(resolvePostLoginRoute("staff", true)).toBe("/staff");
  });

  it("never sends staff to owner routes", () => {
    const route = resolvePostLoginRoute("staff", true);
    expect(route).not.toMatch(/^\/owner\//);
    expect(route).not.toMatch(/^\/system/);
  });

  it("routes non-onboarded users to onboarding first", () => {
    expect(resolvePostLoginRoute("owner", false)).toBe("/onboarding");
    expect(resolvePostLoginRoute("staff", false)).toBe("/staff");
  });
});

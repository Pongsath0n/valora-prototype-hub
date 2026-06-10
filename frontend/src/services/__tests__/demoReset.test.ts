import { beforeEach, describe, expect, it, vi } from "vitest";
import { isDemoResetAvailable, resetDemoData } from "../demoReset";
import { resetAllData } from "@/services/mockStorage";

vi.mock("@/services/mockStorage", () => ({
  resetAllData: vi.fn(),
}));

describe("demoReset service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("clears only namespaced keys and reports them", () => {
    localStorage.setItem("valora:shop", "{}");
    localStorage.setItem("valora:menu", "[]");
    localStorage.setItem("other:key", "should-stay");

    const report = resetDemoData();

    expect(resetAllData).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("other:key")).toBe("should-stay");
    expect(localStorage.getItem("valora:shop")).toBeNull();
    expect(localStorage.getItem("valora:menu")).toBeNull();
    expect(report.clearedKeys).toEqual(expect.arrayContaining(["valora:shop", "valora:menu"]));
    expect(report.clearedKeys.length).toBe(2);
  });

  it("honours flag and environment guards", () => {
    expect(isDemoResetAvailable({ flagEnabled: false, mode: "development" })).toBe(false);
    expect(isDemoResetAvailable({ flagEnabled: true, mode: "production" })).toBe(false);
    expect(isDemoResetAvailable({ flagEnabled: true, mode: "development" })).toBe(true);
  });
});

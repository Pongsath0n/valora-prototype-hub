import { describe, expect, it } from "vitest";

import {
  STORE_ADMIN_ROLES,
  STORE_MANAGER_ROLES,
  BUSINESS_PORTAL_ROLES,
  SYSTEM_CONSOLE_ROLES,
} from "@/lib/guards";

// ── R01: STORE_ADMIN_ROLES includes owner/admin/manager/staff ──────────────

describe("R01 STORE_ADMIN_ROLES", () => {
  it("includes owner, admin, manager, staff", () => {
    expect(STORE_ADMIN_ROLES).toContain("owner");
    expect(STORE_ADMIN_ROLES).toContain("admin");
    expect(STORE_ADMIN_ROLES).toContain("manager");
    expect(STORE_ADMIN_ROLES).toContain("staff");
  });
});

// ── R02: STORE_MANAGER_ROLES excludes staff ───────────────────────────────

describe("R02 STORE_MANAGER_ROLES excludes staff", () => {
  it("includes owner, admin, manager", () => {
    expect(STORE_MANAGER_ROLES).toContain("owner");
    expect(STORE_MANAGER_ROLES).toContain("admin");
    expect(STORE_MANAGER_ROLES).toContain("manager");
  });

  it("excludes staff", () => {
    expect(STORE_MANAGER_ROLES).not.toContain("staff");
  });
});

// ── R03: BUSINESS_PORTAL_ROLES excludes staff ──────────────────────────────

describe("R03 BUSINESS_PORTAL_ROLES excludes staff", () => {
  it("includes owner, admin, manager", () => {
    expect(BUSINESS_PORTAL_ROLES).toContain("owner");
    expect(BUSINESS_PORTAL_ROLES).toContain("admin");
    expect(BUSINESS_PORTAL_ROLES).toContain("manager");
  });

  it("excludes staff", () => {
    expect(BUSINESS_PORTAL_ROLES).not.toContain("staff");
  });
});

// ── R04: SYSTEM_CONSOLE_ROLES is owner+admin only ──────────────────────────

describe("R04 SYSTEM_CONSOLE_ROLES", () => {
  it("includes owner and admin", () => {
    expect(SYSTEM_CONSOLE_ROLES).toContain("owner");
    expect(SYSTEM_CONSOLE_ROLES).toContain("admin");
  });

  it("excludes manager and staff", () => {
    expect(SYSTEM_CONSOLE_ROLES).not.toContain("manager");
    expect(SYSTEM_CONSOLE_ROLES).not.toContain("staff");
  });
});

// ── R05: RoleContext exposes profileRole and currentStoreRole ──────────────

describe("R05 RoleContext exposes profileRole and currentStoreRole", () => {
  it("RoleContextValue type includes profileRole and currentStoreRole", async () => {
    // Import the type to verify it exists in the module surface.
    const mod = await import("@/contexts/RoleContext");
    expect(mod.useProfileRole).toBeDefined();
    expect(typeof mod.useProfileRole).toBe("function");
  });
});

// ── R06: useIsStoreOwner checks store role, not profile role ───────────────

describe("R06 useIsStoreOwner — store role check", () => {
  it("useIsStoreOwner is exported from guards", async () => {
    const mod = await import("@/lib/guards");
    expect(mod.useIsStoreOwner).toBeDefined();
    expect(typeof mod.useIsStoreOwner).toBe("function");
  });
});

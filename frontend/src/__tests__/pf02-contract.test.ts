import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const CUSTOMER_MENU = "src/pages/liff/CustomerMenu.tsx";
const MENU_DETAIL = "src/pages/liff/MenuDetail.tsx";
const ORDER_CONFIRM = "src/pages/liff/OrderConfirm.tsx";
const APP = "src/App.tsx";

// ── UX17: Product Detail P1 param fix remains productId ───────────────────
describe("UX17 Product Detail param remains productId", () => {
  it("MenuDetail reads useParams productId, not id", () => {
    const code = stripComments(readSrc(MENU_DETAIL));
    expect(code).toMatch(/useParams<\{\s*productId[^}]*\}>\(\)/);
    expect(code).toMatch(/const\s*\{\s*productId\s*\}\s*=\s*useParams/);
    // Must NOT regress to destructuring `id`
    expect(code).not.toMatch(/const\s*\{\s*id\s*\}\s*=\s*useParams/);
  });
});

// ── UX18: Product Detail no longer contains note textarea ─────────────────
describe("UX18 Product Detail note textarea removed", () => {
  it("MenuDetail has no note textarea or item-note field", () => {
    const code = readSrc(MENU_DETAIL);
    expect(code).not.toMatch(/id="item-note"/);
    expect(code).not.toMatch(/หมายเหตุ \(ถ้ามี\)/);
    expect(code).not.toMatch(/<textarea/);
  });
});

// ── UX19: No obsolete Product Detail note state submitted ─────────────────
describe("UX19 no obsolete Product Detail note state", () => {
  it("MenuDetail has no note state and does not add note to cart item", () => {
    const code = stripComments(readSrc(MENU_DETAIL));
    // No note useState
    expect(code).not.toMatch(/const\s*\[\s*note\s*,/);
    expect(code).not.toMatch(/setNote/);
    // addCartItem call must not pass a note field
    expect(code).not.toMatch(/note:\s*trimmedNote/);
    expect(code).not.toMatch(/payload\.note\s*=/);
  });
});

// ── UX20: /order/confirm retains optional order-level note ────────────────
describe("UX20 confirm retains order-level note", () => {
  it("OrderConfirm has a single order-level note field", () => {
    const code = readSrc(ORDER_CONFIRM);
    expect(code).toMatch(/orderNote/);
    expect(code).toMatch(/หมายเหตุเพิ่มเติม \(ถ้ามี\)/);
    expect(code).toMatch(/id="order-note"/);
  });
});

// ── UX21: Create payload contains canonical note at most once ─────────────
describe("UX21 canonical note at most once", () => {
  it("OrderConfirm create payload sends order-level note once", () => {
    const code = stripComments(readSrc(ORDER_CONFIRM));
    // The order payload uses note: orderNote.trim()
    expect(code).toMatch(/note:\s*orderNote\.trim\(\)/);
    // There is exactly one order-level note assignment in the create payload
    const orderNoteMatches = code.match(/note:\s*orderNote\.trim\(\)/g) ?? [];
    expect(orderNoteMatches.length).toBe(1);
  });
});

// ── UX28: No mock/hardcoded business data introduced ──────────────────────
describe("UX28 no mock business data", () => {
  it("CustomerMenu has no hardcoded product/menu array", () => {
    const code = stripComments(readSrc(CUSTOMER_MENU));
    // Must fetch from customerApi.listMenu, not a hardcoded list
    // (the call may be chained across lines: customerApi\n.listMenu())
    expect(code).toMatch(/\.listMenu\(\)/);
    expect(code).toMatch(/customerApi/);
    // No obvious hardcoded product fixtures
    expect(code).not.toMatch(/const\s+(MOCK|FAKE|DEMO|SAMPLE)_/i);
    expect(code).not.toMatch(/hardcodedProducts|mockMenu|demoProducts/i);
  });
});

// ── UX29: No direct Supabase business CRUD ────────────────────────────────
describe("UX29 no direct Supabase", () => {
  for (const rel of [CUSTOMER_MENU, MENU_DETAIL]) {
    it(`${rel} does not use direct supabase business access`, () => {
      const code = readSrc(rel);
      expect(code).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
      expect(code).not.toMatch(/supabase\.from\(/);
      expect(code).not.toMatch(/supabase\.rpc\(/);
    });
  }
});

// ── UX30: No payment/slip workflow reintroduced ───────────────────────────
describe("UX30 no payment/slip workflow", () => {
  it("CustomerMenu has no payment or slip workflow", () => {
    const code = readSrc(CUSTOMER_MENU);
    expect(code).not.toMatch(/slip|สลิป/i);
    expect(code).not.toMatch(/promptpay|qr_url|payment_method/i);
  });
});

// ── UX31: No phone/pickup/LINE identity reintroduced ──────────────────────
describe("UX31 no phone/pickup/LINE", () => {
  it("CustomerMenu has no phone/pickup/LINE identity inputs", () => {
    const code = readSrc(CUSTOMER_MENU);
    expect(code).not.toMatch(/phone|เบอร์โทร|โทรศัพท์/i);
    expect(code).not.toMatch(/pickup_time|เวลารับ/i);
    expect(code).not.toMatch(/line_user_id|line_link_token|LIFF/);
  });
});

// ── UX32: No visible Brewway ──────────────────────────────────────────────
describe("UX32 no visible Brewway", () => {
  it("CustomerMenu contains no customer-facing Brewway string", () => {
    const code = readSrc(CUSTOMER_MENU);
    const visibleBrewway = code
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => /Brewway/.test(line))
      .filter((line) => !/brewway-customer/.test(line) && !/className.*brewway/.test(line));
    expect(visibleBrewway).toEqual([]);
  });
});

// ── UX33: /liff/menu/:id compatibility redirect still preserves ID ────────
describe("UX33 legacy redirect preserves ID", () => {
  it("App.tsx /liff/menu/:id redirect uses pathParam id", () => {
    const code = readSrc(APP);
    expect(code).toMatch(/\/liff\/menu\/:id[\s\S]*?LiffLegacyRedirect[\s\S]*?pathParam="id"/);
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── CUST25: Customer-facing Brewway remains absent ─────────────────────────
describe("CUST25 customer-facing Brewway absent", () => {
  const fe02Files = [
    "src/pages/liff/OrderConfirm.tsx",
    "src/pages/liff/OrderSuccess.tsx",
    "src/pages/PrivacyNotice.tsx",
  ];

  for (const rel of fe02Files) {
    it(`${rel} contains no customer-facing "Brewway" string`, () => {
      const full = path.resolve(process.cwd(), rel);
      const content = fs.readFileSync(full, "utf-8");
      // CSS class names like .brewway-customer are implementation details;
      // we only flag customer-visible text occurrences.
      const visibleBrewway = content
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .filter((line) => /Brewway/.test(line))
        .filter((line) => !/brewway-customer/.test(line) && !/className.*brewway/.test(line));
      expect(visibleBrewway).toEqual([]);
    });
  }
});

// ── CUST29: No new /liff navigation introduced ─────────────────────────────
describe("CUST29 no new /liff navigation", () => {
  const fe02Files = [
    "src/pages/liff/OrderConfirm.tsx",
    "src/pages/liff/OrderSuccess.tsx",
    "src/pages/PrivacyNotice.tsx",
  ];

  for (const rel of fe02Files) {
    it(`${rel} does not introduce /liff navigation`, () => {
      const full = path.resolve(process.cwd(), rel);
      const content = fs.readFileSync(full, "utf-8");
      // No `to="/liff` or `navigate("/liff` patterns.
      expect(content).not.toMatch(/to=["'`]\/liff/);
      expect(content).not.toMatch(/navigate\(["'`]\/liff/);
    });
  }
});

// ── CUST34: Privacy Notice data description matches actual V1 payload ─────
describe("CUST34 privacy notice matches V1 payload", () => {
  it("Privacy Notice data points do not mention phone, LINE, slip, or pickup time", () => {
    const full = path.resolve(process.cwd(), "src/pages/PrivacyNotice.tsx");
    const content = fs.readFileSync(full, "utf-8");

    // The DATA_POINTS array lists what is collected. It must only list
    // name, order items, and optional note — matching the canonical V1 payload.
    const dataPointsMatch = content.match(/DATA_POINTS\s*=\s*\[([\s\S]*?)\]/);
    expect(dataPointsMatch).not.toBeNull();
    const dataPoints = dataPointsMatch![1];

    // Must NOT mention phone, LINE user id, slip, bank account, or pickup time as collected data.
    expect(dataPoints).not.toMatch(/เบอร์โทร|phone|โทรศัพท์/i);
    expect(dataPoints).not.toMatch(/LINE|line_user_id|LIFF/i);
    expect(dataPoints).not.toMatch(/สลิป|slip/i);
    expect(dataPoints).not.toMatch(/เวลารับสินค้า|pickup_time/i);
    expect(dataPoints).not.toMatch(/บัญชี|bank/i);

    // Must mention name and order items.
    expect(dataPoints).toMatch(/ชื่อ/);
    expect(dataPoints).toMatch(/รายการสั่งซื้อ/);
  });

  it("OrderConfirm payload only sends customer.name (no LINE identity)", () => {
    const full = path.resolve(process.cwd(), "src/pages/liff/OrderConfirm.tsx");
    const content = fs.readFileSync(full, "utf-8");

    // Strip comments before checking — comments may document what is NOT sent.
    const codeOnly = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // The payload construction must not include line_user_id or line_link_token.
    expect(codeOnly).not.toMatch(/line_user_id/);
    expect(codeOnly).not.toMatch(/line_link_token/);
    expect(codeOnly).not.toMatch(/lineUserId/);
    expect(codeOnly).not.toMatch(/lineLinkToken/);
  });
});

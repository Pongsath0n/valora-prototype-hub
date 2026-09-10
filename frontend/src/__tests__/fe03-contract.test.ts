import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── STAT39: No new /liff navigation introduced ─────────────────────────────
describe("STAT39 no new /liff navigation in FE-03 files", () => {
  const fe03Files = ["src/pages/order/OrderStatusPage.tsx"];

  for (const rel of fe03Files) {
    it(`${rel} does not introduce /liff navigation`, () => {
      const full = path.resolve(process.cwd(), rel);
      const content = fs.readFileSync(full, "utf-8");
      expect(content).not.toMatch(/to=["'`]\/liff/);
      expect(content).not.toMatch(/navigate\(["'`]\/liff/);
    });
  }
});

// ── STAT40: Customer-facing Brewway absent ──────────────────────────────────
describe("STAT40 customer-facing Brewway absent in FE-03 files", () => {
  const fe03Files = ["src/pages/order/OrderStatusPage.tsx"];

  for (const rel of fe03Files) {
    it(`${rel} contains no customer-facing "Brewway" string`, () => {
      const full = path.resolve(process.cwd(), rel);
      const content = fs.readFileSync(full, "utf-8");
      const visibleBrewway = content
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .filter((line) => /Brewway/.test(line))
        .filter((line) => !/brewway-customer/.test(line) && !/className.*brewway/.test(line));
      expect(visibleBrewway).toEqual([]);
    });
  }
});

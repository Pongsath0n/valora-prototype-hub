import { describe, expect, it } from "vitest";
import { formatBaht, formatCups, overheadCategoryLabel, overheadPeriodLabel } from "../overheadLabels";

describe("overheadLabels", () => {
  it("maps category enums to Thai labels (no raw enum leaks for known keys)", () => {
    expect(overheadCategoryLabel("rent")).toBe("ค่าเช่า");
    expect(overheadCategoryLabel("electricity")).toBe("ค่าไฟ");
    expect(overheadCategoryLabel("equipment")).toBe("ค่าเสื่อมอุปกรณ์");
    expect(overheadCategoryLabel("other")).toBe("อื่น ๆ");
    expect(overheadCategoryLabel(null)).toBe("อื่น ๆ");
  });

  it("maps period enums to Thai labels", () => {
    expect(overheadPeriodLabel("daily")).toBe("รายวัน");
    expect(overheadPeriodLabel("weekly")).toBe("รายสัปดาห์");
    expect(overheadPeriodLabel("monthly")).toBe("รายเดือน");
    expect(overheadPeriodLabel(undefined)).toBe("รายเดือน");
  });

  it("formats baht and cups, with an em dash for missing values", () => {
    expect(formatBaht(null)).toBe("—");
    expect(formatBaht(undefined)).toBe("—");
    expect(formatBaht(0)).not.toBe("—");
    expect(formatCups(null)).toBe("—");
    // Break-even cups round up — you cannot break even on a fraction of a cup.
    expect(formatCups(199.2)).toBe("200");
  });
});

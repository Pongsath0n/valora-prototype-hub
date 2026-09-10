import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StoreQrPanel from "@/components/staff/kiosk/StoreQrPanel";

// ── Helpers ────────────────────────────────────────────────────────────────
function renderPanel(props: React.ComponentProps<typeof StoreQrPanel>) {
  return render(
    <MemoryRouter>
      <StoreQrPanel {...props} />
    </MemoryRouter>,
  );
}

const SIGNED_URL = "https://cdn.example.com/qr.png?token=abc123";
const STABLE_URL = "https://cdn.example.com/qr.png";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── SQR01: QR URL present enters image-loading state ──────────────────────
describe("SQR01 image-loading state", () => {
  it("QR URL present enters image-loading state", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    expect(screen.getByText("กำลังโหลด QR สำหรับชำระเงิน...")).toBeInTheDocument();
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img).toHaveAttribute("src", STABLE_URL);
    // Img is invisible until ready (opacity-0)
    expect(img.className).toMatch(/opacity-0/);
  });
});

// ── SQR02: onLoad marks QR ready ──────────────────────────────────────────
describe("SQR02 onLoad marks ready", () => {
  it("onLoad marks QR ready and hides loading overlay", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.load(img);
    });
    // Loading overlay should be gone
    expect(screen.queryByText("กำลังโหลด QR สำหรับชำระเงิน...")).not.toBeInTheDocument();
    // Img should be visible (no opacity-0)
    expect(img.className).not.toMatch(/opacity-0/);
  });
});

// ── SQR03: First image onError triggers exactly one automatic recovery ────
describe("SQR03 auto-retry on first error", () => {
  it("first image onError triggers exactly one automatic recovery", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ── SQR04: Automatic recovery refetches payment-settings ─────────────────
describe("SQR04 auto-retry refetches settings", () => {
  it("automatic recovery calls onRetry (which refetches payment settings)", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: SIGNED_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // onRetry is the settings refetch callback
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ── SQR05: Fresh QR URL is used after recovery ────────────────────────────
describe("SQR05 fresh URL after recovery", () => {
  it("uses fresh QR URL after recovery refetch", () => {
    const onRetry = vi.fn();
    const { rerender } = renderPanel({ amount: 55, qrImageUrl: SIGNED_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // Simulate parent refetch producing a new signed URL
    const NEW_SIGNED_URL = "https://cdn.example.com/qr.png?token=def456";
    rerender(
      <MemoryRouter>
        <StoreQrPanel amount={55} qrImageUrl={NEW_SIGNED_URL} onRetry={onRetry} />
      </MemoryRouter>,
    );
    // New img should have the fresh URL
    const newImg = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(newImg).toHaveAttribute("src", NEW_SIGNED_URL);
  });
});

// ── SQR06: Same payment session is preserved ──────────────────────────────
describe("SQR06 same payment session", () => {
  it("does not remount the entire panel on auto-retry", () => {
    const onRetry = vi.fn();
    const { container } = renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const panelBefore = container.firstChild;
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // Panel root element should be the same (not remounted)
    expect(container.firstChild).toBe(panelBefore);
  });
});

// ── SQR07: Cart remains unchanged ─────────────────────────────────────────
describe("SQR07 cart unchanged", () => {
  it("StoreQrPanel does not accept or modify cart props", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./StoreQrPanel.tsx"),
      "utf-8",
    );
    // StoreQrPanel has no cart-related props or state
    expect(src).not.toMatch(/cart|Cart/i);
  });
});

// ── SQR08: Amount remains unchanged ───────────────────────────────────────
describe("SQR08 amount unchanged", () => {
  it("amount prop is displayed and not modified by retry", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    expect(screen.getByText("ยอดที่ต้องชำระ")).toBeInTheDocument();
    const amountContainer = screen.getByText("ยอดที่ต้องชำระ").parentElement;
    expect(amountContainer?.textContent).toMatch(/55/);
    // Trigger error + auto-retry
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // Amount still 55
    expect(screen.getByText("ยอดที่ต้องชำระ").parentElement?.textContent).toMatch(/55/);
  });
});

// ── SQR09: client_order_id remains unchanged ──────────────────────────────
describe("SQR09 client_order_id unchanged", () => {
  it("StoreQrPanel does not reference client_order_id", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/client_order_id/i);
  });
});

// ── SQR10: Automatic retry happens at most once ───────────────────────────
describe("SQR10 auto-retry at most once", () => {
  it("automatic retry fires at most once even on repeated errors", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Manual retry to get a new img, then error again
    fireEvent.click(screen.getByRole("button", { name: /ลองโหลด QR อีกครั้ง/ }));
    expect(onRetry).toHaveBeenCalledTimes(2);
    // After manual retry, a new img renders — error it again
    const img2 = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img2);
    });
    // Auto-retry should NOT fire again (already used)
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});

// ── SQR11: Second failure shows manual retry state ────────────────────────
describe("SQR11 second failure manual retry", () => {
  it("shows manual retry button after auto-retry also fails", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // After auto-retry fails (no URL change), manual retry button should be visible
    expect(screen.getByRole("button", { name: /ลองโหลด QR อีกครั้ง/ })).toBeInTheDocument();
    expect(screen.getByText("ไม่สามารถแสดง QR สำหรับชำระเงินได้")).toBeInTheDocument();
  });
});

// ── SQR12: Browser broken-image presentation is hidden ───────────────────
describe("SQR12 broken-image hidden", () => {
  it("img is not rendered during error state (no broken-image icon)", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // After error, img should NOT be in the DOM
    expect(screen.queryByAltText("QR พร้อมเพย์ของร้าน")).not.toBeInTheDocument();
  });

  it("img is opacity-0 during loading (no broken-image flash)", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img.className).toMatch(/opacity-0/);
  });
});

// ── SQR13: Manual retry refetches payment-settings ───────────────────────
describe("SQR13 manual retry refetches", () => {
  it("manual retry calls onRetry (refetches payment settings)", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    fireEvent.click(screen.getByRole("button", { name: /ลองโหลด QR อีกครั้ง/ }));
    expect(onRetry).toHaveBeenCalledTimes(2); // 1 auto + 1 manual
  });
});

// ── SQR14: Manual retry does not create order ─────────────────────────────
describe("SQR14 manual retry no order", () => {
  it("StoreQrPanel does not call createKioskOrder", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/createKioskOrder/i);
  });
});

// ── SQR15: Manual retry does not mutate stock ─────────────────────────────
describe("SQR15 manual retry no stock", () => {
  it("StoreQrPanel has no stock mutation code", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/deductStock|mutateStock|stock_deduct|adjustStock|updateStock/i);
  });
});

// ── SQR16: Cash remains usable on QR failure ──────────────────────────────
describe("SQR16 cash on QR failure", () => {
  it("cash method is independent — StoreQrPanel only renders for promptpay", () => {
    // StoreQrPanel is only rendered when paymentMethod === "promptpay".
    // When cash is selected, StoreQrPanel is not rendered at all.
    // This test verifies the component does not interfere with cash.
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    // Even in error state, the amount is still displayed (cash can proceed)
    expect(screen.getByText("ยอดที่ต้องชำระ")).toBeInTheDocument();
  });
});

// ── SQR17: Signed URL query string is not arbitrarily modified ────────────
describe("SQR17 signed URL not modified", () => {
  it("signed URL src is used as-is (no cache-bust nonce appended)", () => {
    renderPanel({ amount: 55, qrImageUrl: SIGNED_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    // Signed URL should be used as-is, no ?retry= appended
    expect(img).toHaveAttribute("src", SIGNED_URL);
    expect(img.getAttribute("src")).not.toMatch(/retry=/);
  });

  it("manual retry does NOT append nonce to signed URL", () => {
    const onRetry = vi.fn();
    renderPanel({ amount: 55, qrImageUrl: SIGNED_URL, onRetry });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    act(() => {
      fireEvent.error(img);
    });
    fireEvent.click(screen.getByRole("button", { name: /ลองโหลด QR อีกครั้ง/ }));
    // After manual retry, the signed URL should NOT have a nonce appended
    const img2 = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img2.getAttribute("src")).not.toMatch(/retry=/);
  });
});

// ── SQR18: No Date.now cache-bust on normal render ───────────────────────
describe("SQR18 no Date.now on render", () => {
  it("StoreQrPanel source does not use Date.now for cache-busting", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/Date\.now\(\)/);
  });

  it("stable URL has no cache-bust on initial render", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img).toHaveAttribute("src", STABLE_URL);
    expect(img.getAttribute("src")).not.toMatch(/retry=|t=|_=/);
  });
});

// ── SQR19: QR size remains tablet-friendly ─────────────────────────────────
describe("SQR19 tablet-friendly size", () => {
  it("QR container uses h-72 w-72 max-w-[80vw]", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    const container = img.parentElement;
    expect(container?.className).toMatch(/h-72/);
    expect(container?.className).toMatch(/w-72/);
    expect(container?.className).toMatch(/max-w-\[80vw\]/);
  });

  it("QR image uses object-contain (no crop)", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img.className).toMatch(/object-contain/);
  });
});

// ── SQR20: Static QR contract preserved ───────────────────────────────────
describe("SQR20 static QR contract", () => {
  it("QR src is the static URL, not a per-order dynamic URL", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    const img = screen.getByAltText("QR พร้อมเพย์ของร้าน");
    expect(img).toHaveAttribute("src", STABLE_URL);
  });

  it("no slip upload UI", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    expect(screen.queryByRole("button", { name: /upload.*slip|อัปโหลด.*สลิป/i })).not.toBeInTheDocument();
  });

  it("no gateway UI", () => {
    renderPanel({ amount: 55, qrImageUrl: STABLE_URL });
    expect(screen.queryByText(/gateway|omise|stripe/i)).not.toBeInTheDocument();
  });

  it("no direct Supabase business CRUD", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "./StoreQrPanel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
    expect(src).not.toMatch(/supabase\.from\(/);
    expect(src).not.toMatch(/supabase\.rpc\(/);
  });
});

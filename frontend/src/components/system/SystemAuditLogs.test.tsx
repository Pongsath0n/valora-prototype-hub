import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/system/SystemLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockLoadAuditBuckets = vi.fn();
vi.mock("@/services/systemConsoleService", () => ({
  loadAuditBuckets: () => mockLoadAuditBuckets(),
}));

describe("SystemAuditLogsPage", () => {
  it("shows empty state when logs unavailable", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce({ status: "unavailable", buckets: { orders: [], payments: [], line_notifications: [] } });
    const { default: Page } = await import("@/pages/system/SystemAuditLogs");

    render(<Page />);

    expect(await screen.findByText(/ไม่สามารถโหลดบันทึกเหตุการณ์/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /โหลดข้อมูลล่าสุด/i })).toBeInTheDocument();
  });
});

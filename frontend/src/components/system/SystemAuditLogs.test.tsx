import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/system/SystemLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockLoadAuditBuckets = vi.fn();
vi.mock("@/services/systemConsoleService", () => ({
  loadAuditBuckets: () => mockLoadAuditBuckets(),
}));

const FULL_UUID = "348544d2-1a2b-4c3d-9e4f-aaaaaaaa452e";
const SHORT_UUID = "348544d2…52e";

function sampleResponse() {
  return {
    status: "ok" as const,
    buckets: {
      orders: [
        {
          id: "log-1",
          source: "orders",
          event_type: "order_status_change",
          order_id: FULL_UUID,
          actor_id: "user-9",
          actor_role: "owner",
          message: "order confirmed (ออเดอร์ถูกยืนยันแล้ว)",
          metadata: { from: "pending", to: "accepted", access_token: "supersecret-value" },
          created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      ],
      payments: [],
      line_notifications: [],
    },
    errors: {},
  };
}

const importPage = async () => (await import("@/pages/system/SystemAuditLogs")).default;

describe("SystemAuditLogsPage", () => {
  it("shows a loading state while buckets are being fetched", async () => {
    let resolve: (v: unknown) => void = () => {};
    mockLoadAuditBuckets.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const Page = await importPage();

    render(<Page />);

    expect(screen.getByText(/audit logs/i)).toBeInTheDocument();
    resolve(sampleResponse());
    expect(await screen.findByText(/order status change/i)).toBeInTheDocument();
  });

  it("shows empty state when logs unavailable (no technical secrets exposed)", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce({ status: "unavailable", buckets: { orders: [], payments: [], line_notifications: [] } });
    const Page = await importPage();

    render(<Page />);

    expect(await screen.findByText(/ไม่สามารถโหลดบันทึกเหตุการณ์/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /โหลดข้อมูลล่าสุด/i })).toBeInTheDocument();
    expect(screen.queryByText(/stack|traceback|Error:/i)).not.toBeInTheDocument();
  });

  it("shows honest connected-but-empty state when queries succeed with no rows", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce({
      status: "partial",
      buckets: { orders: [], payments: [], line_notifications: [] },
      errors: {},
      reason: "no_logs_found",
    });
    const Page = await importPage();

    render(<Page />);

    expect(await screen.findByText(/ยังไม่มีข้อมูลบันทึกเหตุการณ์/i)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีเหตุการณ์ที่ถูกบันทึก/i)).toBeInTheDocument();
    expect(screen.getAllByText("ไม่มีข้อมูล").length).toBe(3);
  });

  it("distinguishes unreadable tables from genuinely empty ones", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce({
      status: "partial",
      buckets: { orders: [], payments: [], line_notifications: [] },
      errors: { orders: "query_failed" },
      reason: "query_failed",
    });
    const Page = await importPage();

    render(<Page />);

    expect(await screen.findByText("อ่านไม่ได้")).toBeInTheDocument();
    expect(screen.getAllByText("ไม่มีข้อมูล").length).toBe(2);
  });

  it("renders short reference IDs and does not show the full UUID in the main row", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce(sampleResponse());
    const Page = await importPage();

    render(<Page />);

    expect(await screen.findByText(SHORT_UUID)).toBeInTheDocument();
    expect(screen.queryByText(FULL_UUID)).not.toBeInTheDocument();
  });

  it("opens a detail view with the full reference, actor, and message", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce(sampleResponse());
    const Page = await importPage();

    render(<Page />);

    const row = await screen.findByRole("button", { name: /ดูรายละเอียด/i });
    fireEvent.click(row);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText(FULL_UUID).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/owner/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/ออเดอร์ถูกยืนยันแล้ว/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/supersecret-value/)).not.toBeInTheDocument();
  });

  it("filters the timeline by source without losing the underlying data", async () => {
    mockLoadAuditBuckets.mockResolvedValueOnce(sampleResponse());
    const Page = await importPage();

    render(<Page />);

    expect(await screen.findByText(/order status change/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "การชำระเงิน" }));
    expect(screen.queryByText(/order status change/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ไม่พบรายการที่ตรงกับตัวกรอง/i)).toBeInTheDocument();
  });
});

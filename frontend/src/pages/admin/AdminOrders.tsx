import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import IncomingOrdersQueue from "@/components/admin/IncomingOrdersQueue";
import ProductionOrdersQueue from "@/components/admin/ProductionOrdersQueue";
import { useProfileRole } from "@/contexts/RoleContext";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Download, Search, ClipboardList, Inbox, AlertTriangle } from "lucide-react";
import {
  storeAdminApi,
  type ApiOrder,
  type OrderPayload,
} from "@/services/storeAdminApi";
import { saveBlobAsFile } from "@/lib/download";
import {
  compareOrdersFifo,
  isCancelledOrArchivedOrder,
} from "@/lib/orderQueue";
import {
  formatOrderStatus,
  orderStatusTone,
  formatPaymentStatus,
  paymentStatusTone,
  formatNextStatusAction,
  formatTHB,
  formatDateTime,
} from "@/lib/format";
import { FormSelect } from "@/components/ui/form-select";

/**
 * The manual "create pickup order" form only collects pickup_time + note —
 * it cannot create a complete order (no customer, items, quantities, channel,
 * totals, or cost/profit snapshot). Until a full Manual Sales Entry flow
 * exists, the form is dev-only and must not appear in production.
 */
export function shouldShowDevCreateOrderForm(isDevBuild: boolean): boolean {
  return isDevBuild;
}
const showDevCreateOrderForm = shouldShowDevCreateOrderForm(Boolean(import.meta.env.DEV));

type TabKey =
  | "incoming"
  | "production"
  | "preparing"
  | "ready"
  | "completed";

const statusTabs: { key: TabKey; label: string; filter: string[] }[] = [
  {
    key: "incoming",
    label: "คิวออเดอร์ใหม่",
    filter: ["pending_payment"],
  },
  {
    key: "production",
    label: "คิวผลิต",
    filter: ["accepted", "preparing", "ready"],
  },
  { key: "preparing", label: "กำลังเตรียม", filter: ["preparing", "accepted"] },
  { key: "ready", label: "พร้อมรับ", filter: ["ready", "ready_for_pickup"] },
  { key: "completed", label: "เสร็จสิ้น", filter: ["completed", "paid"] },
];

// Active operation tabs where cancelled/archived orders must never appear and
// where Staff process orders oldest-first (FIFO).
const ACTIVE_OPERATION_TABS: TabKey[] = ["preparing", "ready"];

const normalizeStatus = (value: string | null | undefined): string => (value ?? "").toLowerCase();

const doesTabContainStatus = (tabKey: TabKey, status: string | null | undefined): boolean => {
  const tab = statusTabs.find((t) => t.key === tabKey);
  if (!tab) return false;
  const normalized = normalizeStatus(status);
  return tab.filter.some((value) => value === normalized);
};

const nextStatusByCurrent: Record<string, string[]> = {
  accepted: ["preparing", "ready"],
  preparing: ["ready", "completed"],
  ready: ["completed"],
};

/**
 * A short, human-readable "what to do next" hint for a queued order, derived
 * entirely from already-loaded order/payment status.
 */
type QueueHint = { label: string; tone: "attention" | "info" | "muted" };

function getQueueHint(order: ApiOrder): QueueHint | null {
  const status = normalizeStatus(order.status);
  if (status === "accepted") {
    return { label: "พร้อมเริ่มเตรียม", tone: "info" };
  }
  if (status === "preparing") {
    return { label: "กำลังเตรียม", tone: "info" };
  }
  if (status === "ready" || status === "ready_for_pickup") {
    return { label: "รอลูกค้ามารับ", tone: "info" };
  }
  return null;
}

const queueHintClasses: Record<QueueHint["tone"], string> = {
  attention: "text-amber-700",
  info: "text-blue-700",
  muted: "text-muted-foreground",
};

function friendlyError(message: string): string {
  if (message === "missing_token" || message === "invalid_token" || message === "unauthorized") {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }
  if (message === "store_access_denied" || message === "no_store_membership" || message === "store_mismatch") {
    return "ไม่มีสิทธิ์เข้าถึงข้อมูลร้านนี้";
  }
  if (message === "insufficient_role") {
    return "สิทธิ์ไม่เพียงพอสำหรับการแก้ไขข้อมูล";
  }
  return message;
}

function errorMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : undefined;
  return friendlyError(msg ?? fallback);
}

function QueueLoadingState() {
  return (
    <div className="rounded-xl border bg-card p-4" role="status" aria-live="polite">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <ClipboardList className="h-4 w-4 animate-pulse" />
        กำลังโหลดคิวออเดอร์...
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
    </div>
  );
}

function QueueEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

const emptyStateCopy: Record<TabKey, { title: string; hint: string }> = {
  incoming: { title: "ยังไม่มีออเดอร์ใหม่", hint: "ออเดอร์ใหม่จะปรากฏที่นี่โดยอัตโนมัติเมื่อมีลูกค้าสั่ง" },
  production: { title: "ยังไม่มีออเดอร์ในคิวผลิต", hint: "ออเดอร์ที่ชำระเงินแล้วจะปรากฏที่นี่โดยอัตโนมัติ" },
  preparing: { title: "ยังไม่มีออเดอร์ที่กำลังเตรียม", hint: "ออเดอร์ที่ยืนยันแล้วจะย้ายมาที่นี่เพื่อเริ่มเตรียม" },
  ready: { title: "ยังไม่มีออเดอร์พร้อมรับ", hint: "ออเดอร์ที่เตรียมเสร็จจะแสดงที่นี่เพื่อรอลูกค้ามารับ" },
  completed: { title: "ยังไม่มีออเดอร์ที่เสร็จสิ้น", hint: "ออเดอร์ที่ปิดงานแล้วจะถูกเก็บไว้ที่นี่" },
};

export default function AdminOrdersPage() {
  // Data export is an owner/admin/manager capability (it can include cost data).
  // Staff never see the export controls; the backend remains the final authority.
  const { role } = useProfileRole();
  const canExport = role ? ["owner", "admin", "manager"].includes(role) : false;
  const [rows, setRows] = useState<ApiOrder[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("incoming");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderPayload>({
    order_type: "pickup",
    pickup_type: "pickup",
    pickup_time: "",
    note: "",
  });
  const [exportingOrders, setExportingOrders] = useState(false);

  const applyOrderStatusOptimistic = (orderId: string, nextStatus: string) => {
    setRows((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status: nextStatus } : order)),
    );
  };

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const ordersData = await storeAdminApi.listOrders();
      const orders = ordersData.items ?? [];
      setRows(orders);
    } catch (err) {
      setError(errorMessage(err, "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExportOrders = async () => {
    setExportingOrders(true);
    try {
      const { blob, filename } = await storeAdminApi.exportOrdersCsv();
      saveBlobAsFile(blob, filename ?? "orders.csv");
    } catch (err) {
      setError(errorMessage(err, "ส่งออกออเดอร์ไม่สำเร็จ"));
    } finally {
      setExportingOrders(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const tab = statusTabs.find((t) => t.key === activeTab);
    const baseRows = rows;
    const isActiveOperationTab = ACTIVE_OPERATION_TABS.includes(activeTab);
    const base = tab
      ? baseRows.filter((r) => {
          // Cancelled / voided / archived orders are excluded from every active
          // operation tab so they never clutter live work queues.
          if (isActiveOperationTab && isCancelledOrArchivedOrder(r)) {
            return false;
          }
          return tab.filter.includes(r.status);
        })
      : rows;
    const searched = query
      ? base.filter((order) => {
          const shortId = order.id.slice(-6).toLowerCase();
          return (
            order.order_no?.toLowerCase().includes(query) ||
            order.id.toLowerCase().includes(query) ||
            shortId.includes(query) ||
            order.customer_name?.toLowerCase().includes(query) ||
            order.customer_phone?.toLowerCase().includes(query)
          );
        })
      : base;

    // FIFO: oldest received order first, then order_no ascending. Active
    // operation queues are intentionally NOT sorted newest-first.
    if (isActiveOperationTab) {
      return [...searched].sort(compareOrdersFifo);
    }
    return searched;
  }, [rows, activeTab, searchText]);

  const handleStatusChange = async (order: ApiOrder, nextStatus: string) => {
    setError("");
    try {
      const res = await storeAdminApi.updateOrderStatus(order.id, { status: nextStatus });
      if (res.mock_notification) setInfo(res.mock_notification);
      applyOrderStatusOptimistic(order.id, nextStatus);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "อัปเดตสถานะไม่สำเร็จ"));
    }
  };

  const handleCreateOrder = async () => {
    setError("");
    setInfo("");
    setCreatingOrder(true);
    try {
      const payload: OrderPayload = {
        order_type: "pickup",
        pickup_type: "pickup",
        pickup_time: orderForm.pickup_time || undefined,
        note: orderForm.note || undefined,
      };
      await storeAdminApi.createOrder(payload);
      setInfo("สร้างออเดอร์รับที่ร้านแล้ว");
      setOrderForm({ order_type: "pickup", pickup_type: "pickup", pickup_time: "", note: "" });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "สร้างออเดอร์ไม่สำเร็จ"));
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <AdminLayout
      title="ออเดอร์"
      subtitle="คิวออเดอร์ การเตรียม และพร้อมรับ"
    >
      {showDevCreateOrderForm ? (
      <div className="stat-card mb-4 space-y-3 border-amber-300">
        <h2 className="section-title text-base">สร้างออเดอร์ Pickup (เครื่องมือทดสอบ — ยังไม่พร้อมใช้งานจริง)</h2>
        <p className="text-xs text-amber-700">
          ฟอร์มนี้ยังไม่เก็บข้อมูลลูกค้า เมนู จำนวน ช่องทาง และยอดเงิน จึงสร้างได้เฉพาะออเดอร์เปล่าสำหรับทดสอบระบบเท่านั้น
          (แสดงเฉพาะโหมดพัฒนา)
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Pickup Time</label>
            <input
              type="datetime-local"
              className="form-input"
              value={orderForm.pickup_time || ""}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, pickup_time: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">หมายเหตุ</label>
            <input
              className="form-input"
              value={orderForm.note || ""}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm"
            onClick={handleCreateOrder}
            disabled={creatingOrder}
          >
            {creatingOrder ? "กำลังสร้าง..." : "สร้างออเดอร์ Pickup"}
          </button>
          <span className="text-xs text-muted-foreground">รองรับ pickup_time สำหรับ flow จาก LIFF ในอนาคต</span>
        </div>
      </div>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-4">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              activeTab === tab.key ? "bg-accent text-accent-foreground border-accent" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {refreshing ? <span className="text-xs text-muted-foreground self-center">กำลังโหลด...</span> : null}
        {canExport ? (
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs"
              onClick={handleExportOrders}
              disabled={exportingOrders}
            >
              <Download className="w-3 h-3" />
              {exportingOrders ? "กำลังส่งออก..." : "ส่งออกออเดอร์"}
            </button>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground bg-background">
          <Search className="w-3.5 h-3.5" />
          <input
            className="bg-transparent text-foreground placeholder:text-muted-foreground text-xs focus:outline-none"
            placeholder="ค้นหาเลขออเดอร์ / ลูกค้า / โทร"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <div className="stat-card mb-4 flex items-start gap-2 border-destructive/40 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {info ? <div className="stat-card mb-4 text-sm text-foreground">{info}</div> : null}

      {activeTab === "ready" || activeTab === "completed" ? (
        <div className="stat-card mb-4">
          <p className="text-sm text-muted-foreground">
            เมื่อออเดอร์พร้อมรับ/สำเร็จ ลูกค้าจะได้รับข้อความแจ้งเตือน:
            "เครื่องดื่มของคุณพร้อมแล้ว สามารถมารับได้เลยครับ"
          </p>
        </div>
      ) : null}

      {activeTab === "incoming" ? (
        <IncomingOrdersQueue />
      ) : activeTab === "production" ? (
        <ProductionOrdersQueue />
      ) : loading ? (
        <QueueLoadingState />
      ) : filteredOrders.length === 0 && !error ? (
        <QueueEmptyState title={emptyStateCopy[activeTab].title} hint={emptyStateCopy[activeTab].hint} />
      ) : (
        <DataTable
          columns={[
            {
              key: "id",
              header: "เลขออเดอร์",
              render: (r) => {
                const hint = getQueueHint(r);
                return (
                  <div className="flex items-center gap-2">
                    {hint?.tone === "attention" ? (
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        aria-label="ต้องการการตรวจสอบ"
                      />
                    ) : null}
                    <Link to={`/store-admin/orders/${r.id}`} className="underline font-medium">
                      {r.order_no || r.id}
                    </Link>
                  </div>
                );
              },
            },
            {
              key: "customer_name",
              header: "ลูกค้า",
              render: (r) => (
                <div className="flex flex-col">
                  <span>{r.customer_name || "-"}</span>
                  <span className="text-xs text-muted-foreground">{r.customer_phone || "-"}</span>
                </div>
              ),
            },
            {
              key: "status",
              header: "สถานะ / ขั้นถัดไป",
              render: (r) => {
                const hint = getQueueHint(r);
                return (
                  <div className="flex flex-col gap-1">
                    <StatusBadge label={formatOrderStatus(r.status)} tone={orderStatusTone(r.status)} />
                    {hint ? (
                      <span className={`text-xs font-medium ${queueHintClasses[hint.tone]}`}>{hint.label}</span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "payment_status",
              header: "การชำระเงิน",
              render: (r) => (
                <div className="flex flex-col gap-1">
                  <StatusBadge label={formatPaymentStatus(r.payment_status)} tone={paymentStatusTone(r.payment_status)} />
                </div>
              ),
            },
            {
              key: "total_amount",
              header: "ยอดรวม",
              className: "whitespace-nowrap",
              render: (r) => (
                <span className="font-semibold text-foreground tabular-nums">{formatTHB(r.total_amount || 0)}</span>
              ),
            },
            {
              key: "pickup_time",
              header: "เวลารับ",
              className: "hidden lg:table-cell whitespace-nowrap",
              render: (r) => (r.pickup_time ? formatDateTime(r.pickup_time) : "-"),
            },
            {
              key: "channel_name",
              header: "ช่องทาง",
              className: "hidden lg:table-cell",
              render: (r) => r.channel_name || "-",
            },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => {
                const options = nextStatusByCurrent[r.status] || [];
                if (options.length === 0) return <span className="text-muted-foreground">-</span>;
                return (
                  <FormSelect
                    value=""
                    placeholder="เลือกการดำเนินการ"
                    ariaLabel="เลือกการดำเนินการถัดไป"
                    onValueChange={(value) => {
                      if (!value) return;
                      void handleStatusChange(r, value);
                    }}
                    options={options.map((s) => ({
                      value: s,
                      label: formatNextStatusAction(s),
                    }))}
                  />
                );
              },
            },
          ]}
          rows={filteredOrders}
        />
      )}
    </AdminLayout>
  );
}

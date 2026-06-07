import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { storeAdminApi, type ApiOrder, type ApiPayment } from "@/services/storeAdminApi";
import { PaymentSlipPreviewModal } from "@/components/admin/PaymentSlipPreviewModal";

const nextStatusActions: { label: string; next: string }[] = [
  { label: "Mark Waiting Payment Review", next: "waiting_payment_review" },
  { label: "Mark Accepted", next: "accepted" },
  { label: "Mark Preparing", next: "preparing" },
  { label: "Mark Ready", next: "ready" },
  { label: "Mark Completed", next: "completed" },
];

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [rejectReasonByPaymentId, setRejectReasonByPaymentId] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<ApiPayment | null>(null);
  const [modalRejectReason, setModalRejectReason] = useState("");

  const refresh = async () => {
    if (!id) return;
    setError("");
    try {
      const [orderData, paymentData] = await Promise.all([
        storeAdminApi.getOrder(id),
        storeAdminApi.listOrderPayments(id),
      ]);
      setOrder(orderData);
      setPayments(paymentData.items ?? []);
    } catch (err: any) {
      setError(err?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const openPaymentPreview = (payment: ApiPayment) => {
    setActivePayment(payment);
    setModalRejectReason(rejectReasonByPaymentId[payment.id] || "");
    setPreviewOpen(true);
  };

  const closePaymentPreview = () => {
    setPreviewOpen(false);
    setActivePayment(null);
    setModalRejectReason("");
  };

  const handleApproveFromModal = async (payment: ApiPayment) => {
    await handleApprovePayment(payment.id);
    closePaymentPreview();
  };

  const handleRejectFromModal = async (payment: ApiPayment) => {
    const resolved = modalRejectReason.trim() || "rejected_by_admin";
    setRejectReasonByPaymentId((prev) => ({ ...prev, [payment.id]: resolved }));
    await handleRejectPayment(payment.id, resolved);
    closePaymentPreview();
  };

  useEffect(() => {
    void refresh();
  }, [id]);

  if (loading) {
    return (
      <AdminLayout title="รายละเอียดออเดอร์" subtitle="">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout title="รายละเอียดออเดอร์" subtitle="">
        <div className="stat-card">
          <p>ไม่พบออเดอร์</p>
          <Link to="/store-admin/orders" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> กลับไปที่ Order Queue
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const handleStatus = async (next: string) => {
    setError("");
    try {
      const res = await storeAdminApi.updateOrderStatus(order.id, { status: next });
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "อัปเดตสถานะไม่สำเร็จ");
    }
  };

  const handleCancel = async () => {
    setError("");
    try {
      await storeAdminApi.cancelOrder(order.id, { reason: "cancelled_by_admin" });
      setInfo("ยกเลิกออเดอร์แล้ว");
      await refresh();
    } catch (err: any) {
      setError(err?.message || "ยกเลิกไม่สำเร็จ");
    }
  };

  const handleApprovePayment = async (paymentId: string) => {
    setError("");
    try {
      const res = await storeAdminApi.approvePayment(paymentId, {});
      if (res.mock_notification) setInfo(res.mock_notification);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "อนุมัติไม่สำเร็จ");
    }
  };

  const handleRejectPayment = async (paymentId: string, providedReason?: string) => {
    setError("");
    try {
      const reason = providedReason?.trim() || rejectReasonByPaymentId[paymentId] || "rejected_by_admin";
      const res = await storeAdminApi.rejectPayment(paymentId, { reason });
      if (res.message) setInfo(res.message);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "ปฏิเสธไม่สำเร็จ");
    }
  };

  return (
    <AdminLayout title="รายละเอียดออเดอร์" subtitle={`Order ${order.order_no || `#${order.id}`}`}>
      <div className="stat-card space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={order.status} tone="info" />
          <span className="text-sm text-muted-foreground">
            Payment: {order.payment_status}
          </span>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
        <p className="text-sm">
          ยอดขาย ฿{Number(order.total_amount || 0).toFixed(2)} | ต้นทุน ฿{Number(order.total_cost || 0).toFixed(2)} | ค่าช่องทาง ฿
          {Number(order.channel_fee || 0).toFixed(2)} | กำไร ฿{Number(order.gross_profit || 0).toFixed(2)}
        </p>
        <p className="text-sm text-muted-foreground">
          ลูกค้า: {order.customer_name || "-"} ({order.customer_phone || "-"})
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {nextStatusActions.map((a) => (
            <button
              key={a.next}
              type="button"
              onClick={() => handleStatus(a.next)}
              className={`px-3 py-1.5 rounded border text-sm ${
                a.next === "cancelled"
                  ? "text-destructive border-destructive/40 hover:bg-destructive/10"
                  : "hover:bg-muted"
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 rounded border text-sm text-destructive border-destructive/40 hover:bg-destructive/10"
          >
            Cancel Order
          </button>
        </div>
      </div>

      <DataTable
        columns={[
          { key: "product_name", header: "เมนู" },
          { key: "quantity", header: "จำนวน" },
          { key: "unit_price", header: "ราคา/หน่วย", render: (r) => `฿${Number(r.unit_price || 0).toFixed(2)}` },
          { key: "unit_cost", header: "ต้นทุน/หน่วย", render: (r) => `฿${Number(r.unit_cost || 0).toFixed(2)}` },
          { key: "line_profit", header: "กำไร", render: (r) => `฿${Number(r.line_profit || 0).toFixed(2)}` },
        ]}
        rows={order.items || []}
      />

      <div className="stat-card">
        <h2 className="section-title mb-2">การชำระเงิน</h2>
        <DataTable
          columns={[
            { key: "id", header: "Payment ID" },
            { key: "amount", header: "จำนวนเงิน", render: (r) => `฿${Number(r.amount || 0).toFixed(2)}` },
            { key: "method", header: "วิธีชำระ" },
            {
              key: "slip",
              header: "หลักฐาน",
              render: (r) => (
                <button
                  type="button"
                  className="underline"
                  onClick={() => openPaymentPreview(r)}
                  disabled={!r.slip_submitted && !r.slip_storage_path && !r.slip_url}
                >
                  ตรวจสลิป
                </button>
              ),
            },
            { key: "status", header: "สถานะ", render: (r) => <StatusBadge label={r.status} tone="info" /> },
            {
              key: "actions",
              header: "จัดการ",
              render: (r) => (
                <div className="flex flex-col gap-1">
                  {(r.status === "pending" || r.status === "pending_review") ? (
                    <>
                      <button type="button" className="underline text-left" onClick={() => handleApprovePayment(r.id)}>อนุมัติ</button>
                      <input
                        className="border rounded px-2 py-1 text-xs"
                        placeholder="เหตุผลการปฏิเสธ"
                        value={rejectReasonByPaymentId[r.id] || ""}
                        onChange={(e) => setRejectReasonByPaymentId((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      <button type="button" className="underline text-left text-destructive" onClick={() => handleRejectPayment(r.id)}>ปฏิเสธ</button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </div>
              ),
            },
          ]}
          rows={payments}
        />
      </div>
      <PaymentSlipPreviewModal
        payment={activePayment}
        isOpen={previewOpen}
        onClose={closePaymentPreview}
        onApprove={(payment) => handleApproveFromModal(payment)}
        onReject={(payment) => handleRejectFromModal(payment)}
        rejectReason={modalRejectReason}
        onRejectReasonChange={setModalRejectReason}
      />
    </AdminLayout>
  );
}

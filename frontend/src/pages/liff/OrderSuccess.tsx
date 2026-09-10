import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { customerApi, type CustomerOrderSummary } from "@/services/customerApi";
import {
  clearCart,
  getLastOrderId,
  getLastOrderNo,
  getLastOrderToken,
  setLastOrderId,
  setLastOrderNo,
  setLastOrderToken,
} from "@/services/cartStorage";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * Canonical V1 Customer Success / Waiting Page.
 *
 * After a successful `POST /api/customer/orders`, the customer lands here.
 * The order is `pending_payment` / `unpaid` — the customer waits for staff to
 * call their name, then pays at the counter (cash or PromptPay).
 *
 * This page does NOT:
 * - Display bank-transfer instructions.
 * - Display slip upload controls.
 * - Call `getPaymentInstructions` or `uploadPaymentSlip`.
 * - Imply the customer needs to pay online.
 *
 * The `public_token` is preserved in localStorage (via `setLastOrderToken`)
 * so the future FE-03 Customer Status flow can look up the order.
 */
export default function OrderSuccessPage() {
  const [orderId, setOrderId] = useState<string | null>(() => getLastOrderId());
  const [order, setOrder] = useState<CustomerOrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(() => getLastOrderNo());
  const [publicToken, setPublicToken] = useState<string | null>(() => getLastOrderToken());

  useEffect(() => {
    if (!orderId) {
      clearCart();
      return;
    }

    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const storedToken = getLastOrderToken();
        if (!storedToken) {
          // No token — can't fetch order details, but we still show the
          // waiting experience using stored metadata (orderNo from localStorage).
          return;
        }
        setPublicToken(storedToken);
        const data = await customerApi.getOrder(orderId, storedToken);
        if (!mounted) return;
        setOrder(data);
        setLastOrderId(data.order_id);
        const resolvedOrderNo = data.order_number ?? data.order_no ?? orderNo;
        if (resolvedOrderNo) {
          setOrderNo(resolvedOrderNo);
          setLastOrderNo(resolvedOrderNo);
        }
      } catch {
        // On refresh, if the order fetch fails we still show the waiting
        // page with whatever metadata we have. Don't block the UX.
        if (mounted) {
          setError(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [orderId]);

  const displayOrderNo = order?.order_number ?? order?.order_no ?? orderNo;
  const customerName = order?.customer_name;
  const statusLink = publicToken
    ? `/order/status?token=${encodeURIComponent(publicToken)}`
    : "/order/status";

  function handleStartOver() {
    clearCart();
    setOrderId(null);
    setOrderNo(null);
    setLastOrderNo(null);
    setPublicToken(null);
    setLastOrderToken(null);
  }

  if (!orderId) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">ยังไม่มีคำสั่งซื้อ</h1>
        <div className="rounded-2xl border border-dashed bg-white/80 p-6 text-center shadow-sm">
          <p className="text-base font-medium text-muted-foreground">
            ไม่พบหมายเลขคำสั่งซื้อสุดท้าย
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            โปรดกลับไปเลือกเมนูและทำรายการใหม่อีกครั้ง
          </p>
          <Link
            to="/order"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            ไปหน้าเมนู
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-6">
      {/* ── Success header ── */}
      <section className="bw-card p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700"
            aria-hidden
          >
            ✓
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">รับออเดอร์เรียบร้อยแล้ว</h1>
            <p className="text-sm text-muted-foreground">
              กรุณารอพนักงานเรียกชื่อของคุณ
            </p>
          </div>
        </div>

        {displayOrderNo ? (
          <div className="mt-4 rounded-2xl bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">หมายเลขออเดอร์</p>
            <p className="text-lg font-bold tracking-wide">{displayOrderNo}</p>
          </div>
        ) : null}

        {customerName ? (
          <div className="mt-2 text-sm text-muted-foreground">
            ชื่อลูกค้า: <span className="font-semibold text-foreground">{customerName}</span>
          </div>
        ) : null}
      </section>

      {/* ── Waiting instructions ── */}
      <section className="bw-card p-5 space-y-3">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">ขั้นตอนถัดไป</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>กรุณารอพนักงานเรียกชื่อของคุณ</li>
            <li>ชำระเงินที่เคาน์เตอร์เมื่อพนักงานเรียกชื่อ</li>
            <li>รอรับสินค้าเมื่อเตรียมเสร็จ</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            ร้านรับชำระด้วยเงินสดและ PromptPay ที่เคาน์เตอร์
          </p>
        </div>
      </section>

      {/* ── Order summary ── */}
      {order ? (
        <section className="bw-card p-4">
          <h2 className="text-base font-semibold">รายการที่สั่ง</h2>
          <div className="mt-3 space-y-3">
            {order.items.map((item) => (
              <div key={item.product_id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{item.product_name || item.product_id}</p>
                  <p className="text-xs text-muted-foreground">
                    x{item.quantity} · {formatCurrency(item.unit_price)}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(item.line_total)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <p className="text-sm text-muted-foreground">ยอดรวม</p>
            <p className="text-lg font-semibold">{formatCurrency(order.total_amount)}</p>
          </div>
        </section>
      ) : loading ? (
        <section className="bw-card p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        </section>
      ) : null}

      {/* ── Actions ── */}
      <div className="space-y-3">
        <Link to={statusLink} className="bw-btn-outline">
          ดูสถานะออเดอร์
        </Link>
        <Link
          to="/order"
          className="inline-flex w-full items-center justify-center rounded-full border border-input px-4 py-2 text-sm font-medium text-foreground"
        >
          สั่งเพิ่ม
        </Link>
        <button
          type="button"
          onClick={handleStartOver}
          className="block w-full text-center text-xs text-muted-foreground underline"
        >
          เริ่มรายการใหม่
        </button>
      </div>
    </div>
  );
}

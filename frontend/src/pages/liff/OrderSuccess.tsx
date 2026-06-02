import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { customerApi, type CustomerOrderSummary } from "@/services/customerApi";
import { clearCart, getLastOrderId, setLastOrderId } from "@/services/cartStorage";

type StatusBadgeProps = {
  label: string;
  tone: "success" | "warning" | "info";
};

function StatusBadge({ label, tone }: StatusBadgeProps) {
  const tones: Record<StatusBadgeProps["tone"], string> = {
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

function translateOrderStatus(value: string): StatusBadgeProps {
  const normalized = value?.toLowerCase?.() ?? "";
  switch (normalized) {
    case "accepted":
      return { label: "ร้านรับออเดอร์แล้ว", tone: "success" };
    case "pending":
      return { label: "รอร้านยืนยัน", tone: "warning" };
    case "ready":
      return { label: "พร้อมรับสินค้า", tone: "success" };
    case "completed":
      return { label: "เสร็จสิ้น", tone: "success" };
    case "cancelled":
      return { label: "ยกเลิกแล้ว", tone: "info" };
    default:
      return { label: value || "สถานะไม่ระบุ", tone: "info" };
  }
}

function translatePaymentStatus(value: string): StatusBadgeProps {
  const normalized = value?.toLowerCase?.() ?? "";
  switch (normalized) {
    case "paid":
      return { label: "ชำระแล้ว", tone: "success" };
    case "pending":
      return { label: "รอชำระ", tone: "warning" };
    default:
      return { label: value || "-", tone: "info" };
  }
}

export default function OrderSuccessPage() {
  const [orderId, setOrderId] = useState<string | null>(() => getLastOrderId());
  const [order, setOrder] = useState<CustomerOrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const data = await customerApi.getOrder(orderId);
        if (!mounted) return;
        setOrder(data);
        setLastOrderId(data.order_id);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้");
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

  const statusBadges = useMemo(() => {
    if (!order) return null;
    return {
      order: translateOrderStatus(order.status),
      payment: translatePaymentStatus(order.payment_status),
    };
  }, [order]);

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
            to="/liff/menu"
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
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">สั่งซื้อสำเร็จ</h1>
        <p className="text-sm text-muted-foreground">
          หมายเลขคำสั่งซื้อ: {orderId}
        </p>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setOrderId(orderId)}
              className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              ลองโหลดอีกครั้ง
            </button>
          </div>
        ) : order ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {statusBadges ? (
                <>
                  <StatusBadge {...statusBadges.order} />
                  <StatusBadge {...statusBadges.payment} />
                </>
              ) : null}
            </div>

            <div className="rounded-2xl bg-muted/40 p-3 text-sm">
              <p className="font-medium">เวลาที่รับโดยประมาณ</p>
              <p className="text-muted-foreground">
                {order.pickup_time
                  ? new Date(order.pickup_time).toLocaleString("th-TH")
                  : "-"}
              </p>
            </div>

            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {item.product_name || item.product_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      x{item.quantity} · {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatCurrency(item.line_total)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-sm text-muted-foreground">ยอดรวม</p>
              <p className="text-lg font-semibold">
                {formatCurrency(order.total_amount)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            กำลังเตรียมข้อมูลคำสั่งซื้อของคุณ...
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-dashed bg-white/60 p-4 text-sm text-muted-foreground">
        <p>LINE แจ้งเตือนยังเป็นโหมดทดสอบ ทำให้ข้อความอาจไม่ถูกส่งจริง</p>
        <p className="mt-1">หากมีข้อสงสัย กรุณาติดต่อร้านค้าโดยตรง</p>
      </section>

      <div className="space-y-3">
        <Link
          to="/liff/menu"
          className="inline-flex w-full items-center justify-center rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold text-primary"
        >
          สั่งเพิ่ม
        </Link>
        <button
          type="button"
          onClick={() => {
            clearCart();
            setOrderId(null);
          }}
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          เคลียร์ข้อมูลและกลับไปหน้าแรก
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { customerApi, type CustomerOrderSummary } from "@/services/customerApi";
import { customerOrderStatus, customerPaymentStatus, type CustomerStatusTone } from "@/lib/customerStatus";
import {
  clearCart,
  getLastOrderId,
  getLastOrderNo,
  getLastOrderToken,
  setLastOrderId,
  setLastOrderNo,
  setLastOrderToken,
} from "@/services/cartStorage";

function StatusBadge({ label, tone }: { label: string; tone: CustomerStatusTone }) {
  const tones: Record<CustomerStatusTone, string> = {
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
    danger: "bg-red-100 text-red-700",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
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

type PaymentInstructions = {
  enabled: boolean;
  method_label: string;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  promptpay_id?: string | null;
  note_lines: string[];
  allowed_file_types: string[];
  max_file_mb: number;
};

const PAYMENT_CONFIG_FALLBACK =
  "ร้านยังไม่ได้ตั้งค่าข้อมูลบัญชีรับชำระเงิน กรุณาติดต่อร้านโดยตรงเพื่อชำระเงิน";

export default function OrderSuccessPage() {
  const [orderId, setOrderId] = useState<string | null>(() => getLastOrderId());
  const [order, setOrder] = useState<CustomerOrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(() => getLastOrderNo());
  const [publicToken, setPublicToken] = useState<string | null>(() => getLastOrderToken());
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [instructionsFailed, setInstructionsFailed] = useState(false);

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
          throw new Error("ไม่พบโทเคนสำหรับตรวจสอบคำสั่งซื้อ กรุณาใช้ลิงก์สถานะล่าสุด");
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

  useEffect(() => {
    let mounted = true;
    customerApi
      .getPaymentInstructions()
      .then((data) => {
        if (mounted) setInstructions(data as PaymentInstructions);
      })
      .catch(() => {
        if (mounted) setInstructionsFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const statusBadges = useMemo(() => {
    if (!order) return null;
    return {
      order: customerOrderStatus(order.status),
      payment: customerPaymentStatus(order.payment_status),
    };
  }, [order]);

  const isPaid = (order?.payment_status ?? "").toLowerCase() === "paid";
  const displayOrderNo = order?.order_number ?? order?.order_no ?? orderNo;
  const statusLink = publicToken
    ? `/order/status?token=${encodeURIComponent(publicToken)}`
    : "/order/status";

  function handleCopyOrderNo() {
    if (!displayOrderNo) return;
    navigator.clipboard?.writeText(displayOrderNo).catch(() => {
      /* ignore */
    });
  }

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
      {/* ── First view: success + key facts + next steps ── */}
      <section className="bw-card p-5">
        <h1 className="text-2xl font-semibold">สั่งซื้อสำเร็จ</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>หมายเลขคำสั่งซื้อ: <span className="font-semibold text-foreground">{displayOrderNo || orderId}</span></span>
          {displayOrderNo ? (
            <button type="button" onClick={handleCopyOrderNo} className="text-primary underline">
              คัดลอก
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-4 animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        ) : error ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setOrderId(orderId)}
              className="inline-flex rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold text-primary"
            >
              ลองโหลดอีกครั้ง
            </button>
          </div>
        ) : order ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {statusBadges ? (
                <>
                  <StatusBadge {...statusBadges.order} />
                  <StatusBadge {...statusBadges.payment} />
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-3">
              <div>
                <p className="text-sm text-muted-foreground">ยอดที่ต้องชำระ</p>
                <p className="text-2xl font-bold">{formatCurrency(order.total_amount)}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-muted-foreground">เวลารับโดยประมาณ</p>
                <p className="font-medium">
                  {order.pickup_time ? new Date(order.pickup_time).toLocaleString("th-TH") : "-"}
                </p>
              </div>
            </div>

            {!isPaid ? (
              <ol className="space-y-1.5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="font-semibold text-foreground">ขั้นตอนถัดไป</p>
                <li className="text-muted-foreground">1. โอนเงินตามยอดที่แสดง</li>
                <li className="text-muted-foreground">2. อัปโหลดสลิปการโอน</li>
                <li className="text-muted-foreground">3. รอร้านตรวจสอบและยืนยันออเดอร์</li>
              </ol>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">กำลังเตรียมข้อมูลคำสั่งซื้อของคุณ...</p>
        )}
      </section>

      {/* ── Payment instruction card ── */}
      {!isPaid ? (
        <section className="bw-card p-5">
          <p className="text-xs font-semibold text-primary/70">ช่องทางการชำระเงิน</p>
          {instructions?.enabled ? (
            <div className="mt-1 space-y-2 text-sm">
              <h2 className="text-lg font-semibold">{instructions.method_label}</h2>
              {instructions.bank_name ? (
                <p><span className="text-muted-foreground">ธนาคาร:</span> {instructions.bank_name}</p>
              ) : null}
              {instructions.account_name ? (
                <p><span className="text-muted-foreground">ชื่อบัญชี:</span> {instructions.account_name}</p>
              ) : null}
              {instructions.account_number ? (
                <p><span className="text-muted-foreground">เลขบัญชี:</span> {instructions.account_number}</p>
              ) : null}
              {instructions.promptpay_id ? (
                <p><span className="text-muted-foreground">PromptPay:</span> {instructions.promptpay_id}</p>
              ) : null}
              {order ? (
                <p><span className="text-muted-foreground">ยอดโอน:</span> <span className="font-semibold">{formatCurrency(order.total_amount)}</span></p>
              ) : null}
              {instructions.note_lines?.length ? (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {instructions.note_lines.map((note, idx) => (
                    <li key={`${note}-${idx}`}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {PAYMENT_CONFIG_FALLBACK}
            </p>
          )}
          {instructionsFailed && !instructions ? (
            <p className="mt-2 text-xs text-muted-foreground">
              โหลดข้อมูลการชำระเงินไม่สำเร็จ — เปิดหน้าเช็กสถานะเพื่อลองใหม่ หรือติดต่อร้านโดยตรง
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Order item summary ── */}
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
      ) : null}

      {/* ── Actions (priority order) ── */}
      <div className="space-y-3">
        {!isPaid ? (
          <a href={statusLink} className="bw-cta">
            อัปโหลดสลิปการโอน
          </a>
        ) : null}
        <a href={statusLink} className="bw-btn-outline">
          ดูสถานะออเดอร์
        </a>
        <Link
          to="/liff/menu"
          className="inline-flex w-full items-center justify-center rounded-full border px-4 py-2 text-sm font-medium text-muted-foreground"
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

      {/* Soft dev-mode note — intentionally low-key and at the bottom */}
      <p className="text-center text-xs text-muted-foreground/80">
        การแจ้งเตือนผ่าน LINE อยู่ระหว่างทดสอบ หากไม่ได้รับข้อความ สามารถติดตามสถานะได้จากหน้านี้
      </p>
    </div>
  );
}

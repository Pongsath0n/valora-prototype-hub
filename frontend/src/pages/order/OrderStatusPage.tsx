import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { cn } from "@/lib/utils";
import { customerApi, type OrderStatusSummary } from "@/services/customerApi";
import { getLastOrderNo, getLastOrderToken, setLastOrderNo, setLastOrderToken } from "@/services/cartStorage";

const TIMELINE: { key: string; label: string }[] = [
  { key: "pending_payment", label: "รอชำระเงิน" },
  { key: "waiting_payment_review", label: "รอตรวจสอบสลิป" },
  { key: "accepted", label: "ร้านรับออเดอร์" },
  { key: "preparing", label: "กำลังเตรียม" },
  { key: "ready", label: "พร้อมรับ" },
  { key: "completed", label: "รับเรียบร้อย" },
];

const EXTRA_STATUS_LABELS: Record<string, string> = {
  cancelled: "ยกเลิกแล้ว",
  paid: "ชำระเงินแล้ว",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

function normalizeStatus(value: string | undefined | null): string {
  return (value || "").toLowerCase();
}

export default function OrderStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const storedToken = getLastOrderToken();
  const tokenFromQuery = searchParams.get("token") ?? storedToken ?? "";

  const [activeToken, setActiveToken] = useState<string>(tokenFromQuery);
  const [statusData, setStatusData] = useState<OrderStatusSummary | null>(null);
  const [lookupOrderNo, setLookupOrderNo] = useState<string>(() => getLastOrderNo() ?? "");
  const [lookupPhone, setLookupPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const lastFetchedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const nextToken = tokenFromQuery.trim();
    if (nextToken && nextToken !== lastFetchedTokenRef.current) {
      void fetchStatusByToken(nextToken);
    } else if (!nextToken && storedToken && storedToken !== lastFetchedTokenRef.current) {
      void fetchStatusByToken(storedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromQuery]);

  async function fetchStatusByToken(tokenValue: string) {
    if (!tokenValue) {
      setStatusData(null);
      setActiveToken("");
      return;
    }
    lastFetchedTokenRef.current = tokenValue;
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrderStatusByToken(tokenValue);
      handleStatusSuccess(response, tokenValue);
    } catch (err: any) {
      setStatusData(null);
      setError(err?.message || "ไม่พบข้อมูลคำสั่งซื้อ");
    } finally {
      setLoading(false);
    }
  }

  function handleStatusSuccess(response: OrderStatusSummary, fallbackToken: string | null) {
    setStatusData(response);
    const resolvedToken = response.public_token ?? fallbackToken ?? "";
    setActiveToken(resolvedToken);
    setLastOrderToken(resolvedToken || null);
    syncTokenInQuery(resolvedToken);
    if (response.order_no) {
      setLastOrderNo(response.order_no);
      setLookupOrderNo(response.order_no);
    }
  }

  function syncTokenInQuery(nextToken: string) {
    const next = new URLSearchParams(searchParams);
    if (nextToken) {
      next.set("token", nextToken);
    } else {
      next.delete("token");
    }
    setSearchParams(next);
  }

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookupOrderNo.trim() || !lookupPhone.trim()) {
      setError("กรุณากรอกเลขออเดอร์และเบอร์โทรศัพท์");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.lookupOrderStatus({
        order_no: lookupOrderNo.trim(),
        phone: lookupPhone.trim(),
      });
      lastFetchedTokenRef.current = response.public_token ?? null;
      handleStatusSuccess(response, response.public_token ?? null);
    } catch (err: any) {
      setStatusData(null);
      setError(err?.message || "ไม่พบข้อมูลตามเลขออเดอร์และเบอร์ที่ระบุ");
    } finally {
      setLoading(false);
    }
  }

  const normalizedStatus = normalizeStatus(statusData?.order_status);
  const timelineSteps = useMemo(() => {
    const steps = [...TIMELINE];
    if (!steps.find((step) => step.key === "cancelled")) {
      steps.push({ key: "cancelled", label: EXTRA_STATUS_LABELS.cancelled });
    }
    const index = steps.findIndex((step) => step.key === normalizedStatus);
    return steps.map((step, idx) => ({
      ...step,
      active: index === idx,
      completed: index > idx,
    }));
  }, [normalizedStatus]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2 text-center">
        <p className="text-sm font-semibold text-primary/80">Web-first Ordering</p>
        <h1 className="text-3xl font-bold tracking-tight">ติดตามสถานะออเดอร์</h1>
        <p className="text-sm text-muted-foreground">
          กรอกเลขออเดอร์หรือใช้ลิงก์สถานะเพื่อดูความคืบหน้าการเตรียมสินค้าและการชำระเงิน
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section
        className={cn(
          "rounded-2xl border bg-white p-5 shadow-sm transition-all duration-500",
          animated ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        )}
      >
        {loading ? (
          <div className="space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : statusData ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">เลขออเดอร์</p>
                <p className="text-2xl font-semibold">{statusData.order_no || "-"}</p>
              </div>
              {activeToken ? (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window === "undefined" || typeof navigator === "undefined") return;
                    const link = `${window.location.origin}/order/status?token=${activeToken}`;
                    navigator.clipboard?.writeText(link).catch(() => {
                      /* ignore */
                    });
                  }}
                  className="text-sm font-medium text-primary"
                >
                  คัดลอกลิงก์สถานะ
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {EXTRA_STATUS_LABELS[normalizedStatus] ?? statusData.order_status}
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {statusData.payment_status}
              </span>
            </div>

            <div className="space-y-2">
              {timelineSteps.map((step) => (
                <div key={step.key} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      step.active
                        ? "bg-primary text-primary-foreground animate-pulse"
                        : step.completed
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {step.completed ? "✓" : step.active ? "•" : ""}
                  </span>
                  <p className="text-sm font-medium text-muted-foreground">{step.label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>ยังไม่มีข้อมูลสถานะให้แสดง</p>
            <p>กรุณาใช้แบบฟอร์มด้านล่างเพื่อตรวจสอบออเดอร์ของคุณ</p>
          </div>
        )}
      </section>

      {statusData ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">สรุปรายการสินค้า</h2>
          <p className="text-sm text-muted-foreground">
            เวลารับโดยประมาณ: {statusData.pickup_time ? new Date(statusData.pickup_time).toLocaleString("th-TH") : "-"}
          </p>
          <div className="mt-3 space-y-3">
            {statusData.items.map((item, idx) => (
              <div key={`${item.product_name}-${idx}`} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{item.product_name || "เมนู"}</p>
                  <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(item.line_total)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <p className="text-sm text-muted-foreground">ยอดรวม</p>
            <p className="text-lg font-semibold">{formatCurrency(statusData.total_amount)}</p>
          </div>
        </section>
      ) : null}

      {statusData ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">การชำระเงิน</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">สถานะการชำระเงิน</p>
              <p className="text-base font-semibold">{statusData.payment.status}</p>
              <p className="text-xs text-muted-foreground">
                {statusData.payment.slip_submitted ? "มีการแนบสลิปแล้ว" : "ยังไม่ส่งหลักฐานการโอน"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">ช่องทางที่ใช้แจ้ง</p>
              <p className="text-base font-semibold capitalize">{statusData.payment.method}</p>
              <p className="text-xs text-muted-foreground">
                จำนวน {formatCurrency(statusData.payment.amount)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">ค้นหาสถานะด้วยเลขออเดอร์</h2>
        <p className="text-sm text-muted-foreground">
          กรอกเลขออเดอร์และเบอร์โทรศัพท์ที่ใช้สั่งซื้อเพื่อดึงข้อมูลล่าสุด
        </p>
        <form onSubmit={handleLookup} className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium" htmlFor="order-no">
              เลขออเดอร์
            </label>
            <input
              id="order-no"
              value={lookupOrderNo}
              onChange={(event) => setLookupOrderNo(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="เช่น ORD-20240601-ABCD"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="phone">
              เบอร์โทรศัพท์ที่ใช้สั่งซื้อ
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              value={lookupPhone}
              onChange={(event) => setLookupPhone(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="08xxxxxxxx"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "กำลังตรวจสอบ..." : "ดึงสถานะล่าสุด"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-dashed bg-white/70 p-5 text-sm text-muted-foreground">
        <p>
          ระบบแจ้งเตือนผ่าน LINE ยังคงเป็นโหมดทดสอบ หากไม่ได้รับการแจ้งเตือน กรุณาตรวจสอบผ่านหน้านี้หรือสอบถามร้านค้าโดยตรง
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/order"
          className="flex-1 rounded-full border border-primary/40 px-4 py-2 text-center text-sm font-semibold text-primary"
        >
          กลับไปสั่งเมนูใหม่
        </Link>
        <Link
          to="/liff/menu"
          className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground"
        >
          เปิดหน้าเมนูแบบเต็ม
        </Link>
      </div>
    </div>
  );
}

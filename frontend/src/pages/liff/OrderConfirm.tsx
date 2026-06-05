import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getCustomerIdentity,
  getManualIdentityFromForm,
  shouldSubmitLineUserId,
  type CustomerIdentity,
} from "@/features/store/customerIdentity";
import { customerApi } from "@/services/customerApi";
import {
  type CartItem,
  clearCart,
  readCart,
  setLastOrderMetadata,
} from "@/services/cartStorage";

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultPickupTime(): string {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30);
  next.setSeconds(0, 0);
  return toLocalDateInputValue(next);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildCartSummary(items: CartItem[]): { total: number } {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { total };
}

export default function OrderConfirmPage() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<CustomerIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(defaultPickupTime);
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cartItems] = useState<CartItem[]>(() => readCart());

  useEffect(() => {
    getCustomerIdentity()
      .then(setIdentity)
      .catch(() => setIdentityError("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้"));
  }, []);

  const summary = useMemo(() => buildCartSummary(cartItems), [cartItems]);
  const disableSubmit =
    submitting || !phone.trim() || !pickupTime || cartItems.length === 0;

  async function confirm() {
    if (cartItems.length === 0) {
      setFormError("ไม่มีสินค้าในตะกร้า โปรดเลือกเมนูก่อนยืนยัน");
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      if (!phone.trim()) {
        throw new Error("กรุณากรอกเบอร์โทรศัพท์สำหรับติดต่อ");
      }

      if (!pickupTime) {
        throw new Error("กรุณาเลือกเวลารับสินค้า");
      }

      const pickupDate = new Date(pickupTime);
      if (Number.isNaN(pickupDate.getTime())) {
        throw new Error("รูปแบบเวลารับสินค้าไม่ถูกต้อง");
      }
      if (pickupDate.getTime() < Date.now()) {
        throw new Error("กรุณาเลือกเวลารับสินค้าในอนาคต");
      }

      const items = cartItems.map((item) => ({
        product_id: item.productId,
        quantity: Math.max(1, Number(item.quantity) || 1),
      }));

      const resolvedIdentity = identity ?? (await getCustomerIdentity());
      const manualIdentity = getManualIdentityFromForm({
        name: resolvedIdentity?.displayName || "ลูกค้า LIFF",
        phone: phone.trim(),
      });
      const lineUserId = shouldSubmitLineUserId(resolvedIdentity)
        ? resolvedIdentity?.lineUserId
        : undefined;

      const order = await customerApi.createOrder({
        customer: {
          name: manualIdentity.displayName || resolvedIdentity?.displayName || "ลูกค้า LIFF",
          phone: manualIdentity.phone || phone.trim(),
          ...(lineUserId ? { line_user_id: lineUserId } : {}),
        },
        items,
        pickup_time: pickupDate.toISOString(),
        note: orderNote.trim() || undefined,
      });

      clearCart();
      setLastOrderMetadata({
        orderId: order.order_id,
        orderNo: order.order_no ?? order.order_number ?? null,
        publicToken: order.public_token ?? null,
      });
      navigate("/liff/success");
    } catch (error: any) {
      setFormError(error?.message || "ไม่สามารถส่งคำสั่งซื้อได้");
    } finally {
      setSubmitting(false);
    }
  }

  if (!cartItems.length) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">ยืนยันคำสั่งซื้อ</h1>
        <div className="rounded-2xl border border-dashed bg-white/80 p-6 text-center shadow-sm">
          <p className="text-base font-medium text-muted-foreground">
            ไม่มีรายการให้ยืนยัน
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            โปรดกลับไปเลือกเมนูและเพิ่มลงตะกร้าก่อน
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
        <h1 className="text-2xl font-semibold">ยืนยันคำสั่งซื้อ</h1>
        <p className="text-sm text-muted-foreground">
          โปรดตรวจสอบข้อมูลก่อนส่งให้ร้านค้า
        </p>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">ลูกค้า</p>
            <p className="text-base font-semibold">
              {identity?.displayName || "ลูกค้า LIFF"}
            </p>
          </div>
          <Link to="/liff/cart" className="text-sm font-medium text-primary">
            กลับไปแก้ไขตะกร้า
          </Link>
        </div>
        {identityError ? (
          <p className="mt-2 text-xs text-destructive">{identityError}</p>
        ) : null}
        <div className="mt-4 space-y-3">
          {cartItems.map((item) => (
            <div key={item.productId} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  x{item.quantity} · {formatCurrency(item.price)}
                </p>
                {item.note ? (
                  <p className="text-xs text-muted-foreground">หมายเหตุ: {item.note}</p>
                ) : null}
              </div>
              <p className="text-sm font-semibold">
                {formatCurrency(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <p className="text-sm text-muted-foreground">ยอดรวมโดยประมาณ</p>
          <p className="text-lg font-semibold">{formatCurrency(summary.total)}</p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="phone">
            เบอร์โทรศัพท์ติดต่อ
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            className="w-full rounded-xl border px-3 py-2 text-base focus:border-primary focus:outline-none"
            placeholder="08xxxxxxxx"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="pickup-time">
            เวลารับสินค้าโดยประมาณ
          </label>
          <input
            id="pickup-time"
            type="datetime-local"
            className="w-full rounded-xl border px-3 py-2 text-base focus:border-primary focus:outline-none"
            value={pickupTime}
            onChange={(event) => setPickupTime(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            แนะนำให้เลือกเวลาอย่างน้อย 30 นาทีจากตอนนี้
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="order-note">
            หมายเหตุเพิ่มเติม (ถ้ามี)
          </label>
          <textarea
            id="order-note"
            rows={3}
            className="w-full rounded-xl border px-3 py-2 text-base focus:border-primary focus:outline-none"
            placeholder="ตัวอย่าง: ไม่ใส่ผักชี"
            value={orderNote}
            onChange={(event) => setOrderNote(event.target.value)}
          />
        </div>
      </section>

      {formError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      ) : null}

      <button
        type="button"
        onClick={confirm}
        disabled={disableSubmit}
        className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60"
      >
        {submitting ? "กำลังส่งคำสั่งซื้อ..." : "ยืนยันคำสั่งซื้อ"}
      </button>
    </div>
  );
}

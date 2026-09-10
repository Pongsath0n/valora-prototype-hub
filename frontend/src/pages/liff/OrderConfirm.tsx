import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { customerApi, type CustomerOrderItemOptions } from "@/services/customerApi";
import OrderFlowNav from "@/components/customer/OrderFlowNav";
import {
  type CartItem,
  clearCart,
  getCartItemLineTotal,
  getCartItemUnitPrice,
  getCartItemKey,
  readCart,
  reconcileCartWithProductIds,
  setLastOrderMetadata,
} from "@/services/cartStorage";
import { mapCustomerOrderError } from "@/lib/customerErrors";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildCartSummary(items: CartItem[]): { total: number } {
  const total = items.reduce((sum, item) => sum + getCartItemLineTotal(item), 0);
  return { total };
}

function buildItemOptionsPayload(item: CartItem): CustomerOrderItemOptions | undefined {
  const options: CustomerOrderItemOptions = {};
  const sweetness = item.options?.sweetness;
  if (sweetness !== undefined) {
    options.sweetness = sweetness;
  }
  if (item.options?.addons?.length) {
    const addons = item.options.addons
      .map((addon) => ({
        addon_id: addon.addon_id,
        quantity: Math.max(0, Math.floor(Number(addon.quantity) || 0)),
      }))
      .filter((addon) => addon.quantity > 0);
    if (addons.length) {
      options.addons = addons;
    }
  }
  const note = item.options?.note ?? item.note;
  if (note) {
    options.note = note;
  }
  return Object.keys(options).length ? options : undefined;
}

export default function OrderConfirmPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>(() => readCart());
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [pdpaAccepted, setPdpaAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function validateCart() {
      const current = readCart();
      if (!current.length) {
        setCartItems([]);
        return;
      }
      try {
        const menus = await customerApi.listMenu();
        if (cancelled) return;
        const validIds = new Set(menus.map((menu) => menu.id));
        const { items: filtered, removedCount } = reconcileCartWithProductIds(validIds);
        if (!cancelled) {
          setCartItems(filtered);
          if (removedCount > 0) {
            setCartNotice("ระบบลบเมนูที่ไม่พร้อมขายออกจากคำสั่งซื้อแล้ว โปรดตรวจสอบรายการอีกครั้งก่อนยืนยัน");
          }
        }
      } catch {
        // Ignore menu fetch issues; errors will be surfaced during submission instead.
      }
    }
    void validateCart();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => buildCartSummary(cartItems), [cartItems]);
  const trimmedName = customerName.trim();
  const disableSubmit =
    submitting || !trimmedName || cartItems.length === 0 || !pdpaAccepted;

  async function confirm() {
    if (cartItems.length === 0) {
      setFormError("ไม่มีสินค้าในตะกร้า โปรดเลือกเมนูก่อนยืนยัน");
      return;
    }

    if (!trimmedName) {
      setFormError("กรุณาระบุชื่อสำหรับการสั่งซื้อ");
      return;
    }

    if (!pdpaAccepted) {
      setFormError("โปรดยืนยันการใช้ข้อมูลตามนโยบายความเป็นส่วนตัวก่อนส่งคำสั่งซื้อ");
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const items = cartItems.map((item) => {
        const payload: {
          product_id: string;
          quantity: number;
          options?: CustomerOrderItemOptions;
        } = {
          product_id: item.productId,
          quantity: Math.max(1, Number(item.quantity) || 1),
        };
        const options = buildItemOptionsPayload(item);
        if (options) {
          payload.options = options;
        }
        return payload;
      });

      // Canonical V1 payload: customer.name required.
      // No phone, pickup_time, line_user_id, line_link_token, or
      // price/cost/total/_system/usage_breakdown/ingredient data sent.
      const orderPayload: Parameters<typeof customerApi.createOrder>[0] = {
        customer: {
          name: trimmedName,
        },
        items,
        note: orderNote.trim() || undefined,
      };

      const order = await customerApi.createOrder(orderPayload);

      // Clear cart ONLY after confirmed successful createOrder response.
      clearCart();
      setLastOrderMetadata({
        orderId: order.order_id,
        orderNo: order.order_no ?? order.order_number ?? null,
        publicToken: order.public_token ?? null,
      });
      navigate("/order/success");
    } catch (error) {
      // Remain on confirmation page; keep cart, name, and note for retry.
      setFormError(mapCustomerOrderError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!cartItems.length) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">ยืนยันคำสั่งซื้อ</h1>
        <div className="bw-card border-dashed p-8 text-center">
          <p className="text-base font-semibold text-muted-foreground">ไม่มีรายการให้ยืนยัน</p>
          <p className="mt-1 text-sm text-muted-foreground">โปรดกลับไปเลือกเมนูและเพิ่มลงตะกร้าก่อน</p>
          <Link to="/order" className="bw-cta mt-4">
            ไปหน้าเมนู
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">ยืนยันคำสั่งซื้อ</h1>
        <p className="text-sm text-muted-foreground">โปรดตรวจสอบข้อมูลก่อนส่งให้ร้านค้า</p>
      </div>

      {cartNotice ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {cartNotice}
        </div>
      ) : null}

      {/* Review-step navigation (before submission): go back to the cart, or
          jump to the menu to change items/sweetness/add-ons. The cart draft is
          preserved in localStorage, so neither action loses the order draft. */}
      <OrderFlowNav backTo="/order/cart" editItemsTo="/order" />

      <section className="bw-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">ลูกค้า</p>
            <p className="text-base font-bold">{customerName.trim() || "ลูกค้า"}</p>
          </div>
          <Link to="/order/cart" className="text-sm font-semibold text-primary">
            แก้ไขตะกร้า
          </Link>
        </div>
        <div className="mt-4 space-y-3 border-t pt-3">
          {cartItems.map((item, index) => (
            <div key={getCartItemKey(item, index)} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  x{item.quantity} · {formatCurrency(getCartItemUnitPrice(item))} / แก้ว (ประมาณ)
                </p>
                {item.options?.sweetness !== undefined ? (
                  <p className="text-xs text-muted-foreground">ความหวาน: {item.options.sweetness}%</p>
                ) : null}
                {item.options?.addons?.map((addon, addonIndex) => (
                  <p key={`${addon.addon_id}-${addonIndex}`} className="text-xs text-muted-foreground">
                    เพิ่มช็อต x{addon.quantity} (+
                    {formatCurrency((Number(addon.price ?? 0) || 0) * Math.max(1, addon.quantity))}/แก้ว)
                  </p>
                ))}
                {item.note ? (
                  <p className="text-xs text-muted-foreground">หมายเหตุ: {item.note}</p>
                ) : null}
              </div>
              <p className="text-sm font-bold">{formatCurrency(getCartItemLineTotal(item))}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <p className="text-sm text-muted-foreground">ยอดรวมโดยประมาณ</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(summary.total)}</p>
        </div>
      </section>

      <section className="bw-card space-y-4 p-4">
        {/* Canonical V1: customer name is the only required customer field. */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" htmlFor="customer-name">
            ชื่อสำหรับการสั่งซื้อ <span className="text-destructive">*</span>
          </label>
          <input
            id="customer-name"
            type="text"
            className="bw-input"
            placeholder="ชื่อที่พนักงานจะเรียก"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold" htmlFor="order-note">
            หมายเหตุเพิ่มเติม (ถ้ามี)
          </label>
          <textarea
            id="order-note"
            rows={3}
            className="bw-input"
            placeholder="ตัวอย่าง: ไม่ใส่ผักชี"
            value={orderNote}
            onChange={(event) => setOrderNote(event.target.value)}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
        <p>
          ร้านจะใช้ข้อมูลที่ระบุ ได้แก่ ชื่อ และรายการสั่งซื้อ เพื่อรับออเดอร์ แจ้งสถานะ และให้บริการหลังการขายเท่านั้น
        </p>
        <label className="flex items-start gap-3 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 rounded border-primary text-primary focus:ring-primary"
            checked={pdpaAccepted}
            onChange={(event) => setPdpaAccepted(event.target.checked)}
          />
          <span>
            ข้าพเจ้ารับทราบว่าร้านจะใช้ข้อมูลชื่อและรายการสั่งซื้อ เพื่อดำเนินการรับออเดอร์ แจ้งสถานะคำสั่งซื้อ และให้บริการหลังการขาย
          </span>
        </label>
        <p className="text-xs">
          อ่านรายละเอียดฉบับเต็มได้ที่{" "}
          <Link to="/privacy" className="font-semibold text-primary underline">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </section>

      {formError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      ) : null}

      <button type="button" onClick={confirm} disabled={disableSubmit} className="bw-cta">
        {submitting ? "กำลังส่งคำสั่งซื้อ..." : "ยืนยันคำสั่งซื้อ"}
      </button>
    </div>
  );
}

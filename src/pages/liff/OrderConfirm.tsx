import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLiffProfile } from "@/features/store/liffService";
import { addOrderItem, createOrder, upsertLineCustomer } from "@/features/store/transactionApi";

export default function OrderConfirmPage() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cart = JSON.parse(localStorage.getItem("valora:liff:cart") || "[]");
  const total = useMemo(() => cart.reduce((s: number, i: any) => s + Number(i.unitPrice || 0) * Number(i.quantity || 0), 0), [cart]);

  useEffect(() => { getLiffProfile().then(setProfile); }, []);

  async function confirm() {
    try {
      setLoading(true); setError("");
      if (!profile?.userId) throw new Error("ไม่พบข้อมูล LINE โปรดลองใหม่");
      if (!pickupTime) throw new Error("กรุณาเลือกเวลารับสินค้า");
      if (!cart.length) throw new Error("ไม่มีสินค้าในตะกร้า");

      const c = await upsertLineCustomer({ lineUserId: profile.userId, displayName: profile.displayName || "ลูกค้า LINE", phone });
      const order = await createOrder({ customerId: c.customer_id, pickupTime, customerNote });
      for (const item of cart) await addOrderItem(order.id, item);

      localStorage.setItem("valora:liff:last_order", order.id);
      localStorage.setItem("valora:liff:last_customer", c.customer_id);
      localStorage.setItem("valora:liff:last_total", String(total));
      localStorage.removeItem("valora:liff:cart");
      nav(`/liff/success?order_id=${order.id}`);
    } catch (e: any) {
      setError(e.message || "ไม่สามารถยืนยันออเดอร์ได้");
    } finally {
      setLoading(false);
    }
  }

  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">ยืนยันคำสั่งซื้อ</h1>
    <input className="form-input" placeholder="เบอร์โทร" value={phone} onChange={(e) => setPhone(e.target.value)} />
    <input type="datetime-local" className="form-input" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
    <textarea className="form-input" placeholder="หมายเหตุสำหรับร้าน" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
    <div className="text-sm">ยอดรวมชำระ: <b>฿{total.toFixed(2)}</b></div>
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    <button disabled={loading} onClick={confirm} className="w-full bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-60">{loading ? "กำลังส่งคำสั่งซื้อ..." : "ยืนยันคำสั่งซื้อ"}</button>
  </div>;
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getOrderDetail, uploadPaymentSlip } from "@/features/store/transactionApi";

export default function OrderSuccessPage() {
  const [params] = useSearchParams();
  const orderId = params.get("order_id") || localStorage.getItem("valora:liff:last_order") || "";
  const customerId = localStorage.getItem("valora:liff:last_customer") || "";
  const total = Number(localStorage.getItem("valora:liff:last_total") || 0);

  const [order, setOrder] = useState<any>(null);
  const [slipUrl, setSlipUrl] = useState("");
  const [slipFile, setSlipFile] = useState("slip.jpg");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { if (orderId) getOrderDetail(orderId).then(setOrder).catch(() => {}); }, [orderId]);

  async function submitSlip() {
    try {
      setSubmitting(true); setMsg("");
      await uploadPaymentSlip({
        orderId,
        customerId,
        amount: total,
        slipUrl: slipUrl || undefined,
        slipFileName: slipFile,
        slipStoragePath: "payment-slips/TEST/slip.jpg",
      });
      const refetched = await getOrderDetail(orderId);
      setOrder(refetched);
      setMsg("ส่งสลิปสำเร็จ สถานะรอตรวจสอบการชำระเงิน");
    } catch (e: any) { setMsg(e.message || "ส่งสลิปไม่สำเร็จ"); }
    finally { setSubmitting(false); }
  }

  return <div className="max-w-md mx-auto p-4 space-y-3">
    <h1 className="text-xl font-bold">สถานะคำสั่งซื้อ</h1>
    <div className="border rounded p-3 text-sm space-y-1">
      <p>เลขออเดอร์: <b>{order?.order_no || orderId || "-"}</b></p>
      <p>ยอดชำระ: <b>฿{total.toFixed(2)}</b></p>
      <p>เวลารับ: {order?.pickup_time || "-"}</p>
      <p>สถานะออเดอร์: <b>{order?.order_status || "pending_payment"}</b></p>
      <p>สถานะชำระเงิน: <b>{order?.payment_status || "unpaid"}</b></p>
    </div>

    <div className="border rounded p-3 space-y-2">
      <h2 className="font-semibold">วิธีชำระเงิน</h2>
      <p className="text-sm">โอนเงินเข้าบัญชีร้าน แล้วแนบลิงก์สลิปด้านล่าง</p>
      <input className="form-input" placeholder="Slip URL (เช่น Supabase storage public URL)" value={slipUrl} onChange={(e) => setSlipUrl(e.target.value)} />
      <input className="form-input" placeholder="ชื่อไฟล์สลิป" value={slipFile} onChange={(e) => setSlipFile(e.target.value)} />
      <button onClick={submitSlip} disabled={submitting || !orderId || !customerId} className="w-full bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-60">{submitting ? "กำลังส่งสลิป..." : "ส่งสลิปชำระเงิน"}</button>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  </div>;
}

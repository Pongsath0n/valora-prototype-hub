import { Link } from "react-router-dom";

export default function CartPage() {
  const cart = JSON.parse(localStorage.getItem("valora:liff:cart") || "[]");
  const total = cart.reduce((s: number, i: any) => s + Number(i.unitPrice || 0) * Number(i.quantity || 0), 0);

  return (
    <div className="max-w-md mx-auto p-4 space-y-3">
      <h1 className="text-xl font-bold">ตะกร้ารายการสั่งซื้อ</h1>
      {cart.map((c: any, i: number) => (
        <div key={i} className="border rounded p-3 text-sm">
          <p className="font-medium">{c.productNameSnapshot}</p>
          <p>จำนวน {c.quantity}</p>
          <p>฿{Number(c.unitPrice).toFixed(2)}</p>
        </div>
      ))}
      <div className="border rounded p-3 font-semibold">ยอดรวม ฿{total.toFixed(2)}</div>
      <Link className="w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded inline-block" to="/liff/confirm">เลือกเวลารับและชำระเงิน</Link>
    </div>
  );
}

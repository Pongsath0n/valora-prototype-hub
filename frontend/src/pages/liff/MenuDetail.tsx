import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";
import { addCartItem } from "@/services/cartStorage";

export default function MenuDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [menu, setMenu] = useState<CustomerMenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setMenu(null);
      return;
    }
    setLoading(true);
    setError(null);
    customerApi
      .getMenuDetail(id)
      .then((m) => setMenu(m))
      .catch((e: any) => {
        setError(e?.message || "ไม่สามารถโหลดรายละเอียดเมนูได้");
        setMenu(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function addToCart() {
    if (!menu) return;
    const safeQty = Math.max(1, Number(qty) || 1);
    addCartItem({
      productId: menu.id,
      name: menu.name,
      price: menu.price,
      quantity: safeQty,
      note,
    });
    setFeedback("เพิ่มสินค้าในตะกร้าแล้ว");
    nav("/liff/cart");
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">กำลังโหลดรายละเอียดเมนู...</div>;
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        <p>{error}</p>
        <button
          type="button"
          className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => {
            if (!id) return;
            setLoading(true);
            setError(null);
            customerApi
              .getMenuDetail(id)
              .then((m) => setMenu(m))
              .catch((e: any) => {
                setError(e?.message || "ไม่สามารถโหลดรายละเอียดเมนูได้");
                setMenu(null);
              })
              .finally(() => setLoading(false));
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!menu) {
    return (
      <div className="p-4 text-sm">
        <p>ไม่พบข้อมูลเมนู</p>
        <button
          type="button"
          className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => nav("/liff/menu")}
        >
          กลับไปหน้าเมนู
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold">{menu.name}</h1>
        {menu.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{menu.description}</p>
        ) : null}
        <p className="mt-4 text-lg font-semibold">฿{menu.price.toLocaleString()}</p>
      </div>

      <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">จำนวนแก้ว</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="form-input"
        />
        <label className="text-sm font-medium">หมายเหตุ (ถ้ามี)</label>
        <textarea
          className="form-input"
          rows={3}
          placeholder="เช่น เพิ่มความหวาน เพิ่มช็อต"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {feedback ? <p className="text-sm text-green-600">{feedback}</p> : null}

      <button
        className="w-full rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground"
        onClick={addToCart}
      >
        เพิ่มลงตะกร้า
      </button>
      <button
        className="w-full rounded-full border px-4 py-3 text-base font-semibold"
        onClick={() => nav("/liff/menu")}
      >
        ดูเมนูอื่น
      </button>
    </div>
  );
}

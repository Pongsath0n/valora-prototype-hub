import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchMenus, type MenuItem } from "@/features/store/transactionApi";

export default function MenuDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [sweetness, setSweetness] = useState("ปกติ");
  const [ice, setIce] = useState("ปกติ");

  useEffect(() => { fetchMenus().then(setMenus).catch(() => {}); }, []);
  const menu = useMemo(() => menus.find((m) => m.id === id), [menus, id]);

  if (!menu) return <div className="max-w-md mx-auto p-4">ไม่พบเมนู</div>;

  function addToCart() {
    const cart = JSON.parse(localStorage.getItem("valora:liff:cart") || "[]");
    cart.push({
      productId: menu.id,
      productNameSnapshot: menu.name,
      quantity,
      unitPrice: Number(menu.base_price || 0),
      unitCost: 0,
      options: { sweetness, ice },
      note: note || undefined,
    });
    localStorage.setItem("valora:liff:cart", JSON.stringify(cart));
    nav("/liff/cart");
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-3">
      <h1 className="text-xl font-bold">{menu.name}</h1>
      <p className="text-sm text-muted-foreground">{menu.description || "-"}</p>
      <p className="font-semibold">฿{Number(menu.base_price || 0).toFixed(2)}</p>
      <input type="number" min={1} className="form-input" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
      <select className="form-input" value={sweetness} onChange={(e) => setSweetness(e.target.value)}>
        <option>หวานปกติ</option><option>หวานน้อย</option><option>ไม่หวาน</option>
      </select>
      <select className="form-input" value={ice} onChange={(e) => setIce(e.target.value)}>
        <option>น้ำแข็งปกติ</option><option>น้ำแข็งน้อย</option><option>ไม่ใส่น้ำแข็ง</option>
      </select>
      <textarea className="form-input" placeholder="หมายเหตุเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="w-full bg-primary text-primary-foreground px-4 py-2 rounded" onClick={addToCart}>เพิ่มลงตะกร้า</button>
    </div>
  );
}

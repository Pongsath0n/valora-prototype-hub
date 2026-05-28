import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";

export default function MenuDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [menu, setMenu] = useState<CustomerMenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setMenu(null);
      return;
    }
    customerApi
      .getMenuDetail(id)
      .then((m) => setMenu(m))
      .catch((e: any) => {
        setError(e?.message || "Failed to load menu detail");
        setMenu(null);
      });
  }, [id]);

  function addToCart() {
    if (!menu) return;
    const safeQty = Math.max(1, Number(qty) || 1);
    const cart = JSON.parse(localStorage.getItem("valora:liff:cart") || "[]");
    cart.push({ productId: menu.id, name: menu.name, price: menu.price, quantity: safeQty, note });
    localStorage.setItem("valora:liff:cart", JSON.stringify(cart));
    nav("/liff/cart");
  }

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if(!menu) return <div className="p-4">Menu not found</div>;
  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">{menu.name}</h1>{menu.description?<p className="text-sm text-muted-foreground">{menu.description}</p>:null}<p>฿{menu.price}</p><input type="number" min={1} className="form-input" value={qty} onChange={(e)=>setQty(Number(e.target.value))} /><input className="form-input" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="note"/><button className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={addToCart}>Add to cart</button></div>;
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { menuCatalogService, type MenuItem } from "@/features/store/catalogService";

export default function MenuDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [menu, setMenu] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  useEffect(()=>{menuCatalogService.list().then((m)=>setMenu(m.find(x=>x.id===id) ?? null));},[id]);
  if(!menu) return <div className="p-4">Menu not found</div>;
  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">{menu.name}</h1><p>฿{menu.basePrice}</p><input type="number" className="form-input" value={qty} onChange={(e)=>setQty(Number(e.target.value))} /><input className="form-input" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="note"/><button className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={()=>{ const cart=JSON.parse(localStorage.getItem('valora:liff:cart')||'[]'); cart.push({menuId:menu.id,quantity:qty,note}); localStorage.setItem('valora:liff:cart',JSON.stringify(cart)); nav('/liff/cart');}}>Add to cart</button></div>;
}

import { Link } from "react-router-dom";

export default function CartPage() {
  const cart = JSON.parse(localStorage.getItem('valora:liff:cart')||'[]');
  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">Cart</h1>{cart.map((c:any,i:number)=><div key={i} className="border rounded p-2 text-sm">{c.menuId} x{c.quantity} {c.note||""}</div>)}<Link className="bg-primary text-primary-foreground px-4 py-2 rounded inline-block" to="/liff/confirm">Continue</Link></div>;
}

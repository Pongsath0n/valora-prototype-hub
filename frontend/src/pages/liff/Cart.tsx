import { Link } from "react-router-dom";

export default function CartPage() {
  const cart = JSON.parse(localStorage.getItem("valora:liff:cart") || "[]");
  const total = cart.reduce((sum: number, c: any) => sum + (Number(c.price) || 0) * (Number(c.quantity) || 0), 0);
  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">Cart</h1>{cart.map((c:any,i:number)=><div key={i} className="border rounded p-2 text-sm"><p>{c.name || c.productId} x{c.quantity}</p>{c.note?<p className="text-xs text-muted-foreground">note: {c.note}</p>:null}{typeof c.price === "number" ? <p className="text-xs text-muted-foreground">฿{c.price}</p> : null}</div>)}<p className="text-sm font-medium">Estimated total: ฿{total}</p><Link className="bg-primary text-primary-foreground px-4 py-2 rounded inline-block" to="/liff/confirm">Continue</Link></div>;
}

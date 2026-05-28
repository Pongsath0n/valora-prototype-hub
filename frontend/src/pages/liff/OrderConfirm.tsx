import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLiffProfile } from "@/features/store/liffService";
import { customerApi } from "@/services/customerApi";

export default function OrderConfirmPage() {
  const nav=useNavigate();
  const [phone,setPhone]=useState("");
  const [pickupTime,setPickupTime]=useState("");
  const [orderNote,setOrderNote]=useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profile,setProfile]=useState<any>(null);
  const [error,setError]=useState("");
  useEffect(()=>{getLiffProfile().then(setProfile)},[]);
  const cart = JSON.parse(localStorage.getItem('valora:liff:cart')||'[]');
  async function confirm(){
    try{
      setSubmitting(true);
      if(!pickupTime) throw new Error('Please select pickup time');
      if(!phone.trim()) throw new Error('Please provide phone number');
      const items = cart.map((c:any) => ({ product_id: c.productId || c.menuId, quantity: Number(c.quantity || 0) }));
      if (!items.length) throw new Error("Cart is empty");
      const order = await customerApi.createOrder({
        customer: {
          name: (profile?.displayName || "Guest Customer").trim(),
          phone: phone.trim(),
          line_user_id: profile?.userId || undefined,
        },
        items,
        pickup_time: new Date(pickupTime).toISOString(),
        note: orderNote?.trim() || undefined,
      });
      localStorage.removeItem('valora:liff:cart');
      localStorage.setItem('valora:liff:last_order', order.order_id);
      nav('/liff/success');
    }catch(e:any){setError(e.message||'Failed');}
    finally { setSubmitting(false); }
  }
  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">Confirm Order</h1><input className="form-input" placeholder="phone" value={phone} onChange={(e)=>setPhone(e.target.value)} /><input type="datetime-local" className="form-input" value={pickupTime} onChange={(e)=>setPickupTime(e.target.value)} /><textarea className="form-input" placeholder="order note" value={orderNote} onChange={(e)=>setOrderNote(e.target.value)} />{error?<p className="text-sm text-red-600">{error}</p>:null}<button onClick={confirm} disabled={submitting} className="bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-60">{submitting ? "Placing..." : "Place order"}</button></div>;
}

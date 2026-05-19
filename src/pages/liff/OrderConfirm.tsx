import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createLineOaOrder } from "@/features/store/transactionApi";
import { getLiffProfile } from "@/features/store/liffService";

export default function OrderConfirmPage() {
  const nav=useNavigate();
  const [phone,setPhone]=useState("");
  const [pickupTime,setPickupTime]=useState("");
  const [orderNote,setOrderNote]=useState("");
  const [profile,setProfile]=useState<any>(null);
  const [error,setError]=useState("");
  useEffect(()=>{getLiffProfile().then(setProfile)},[]);
  const cart = JSON.parse(localStorage.getItem('valora:liff:cart')||'[]');
  async function confirm(){
    try{
      if(!pickupTime) throw new Error('Please select pickup time');
      const result=await createLineOaOrder({lineUserId:profile.userId,lineDisplayName:profile.displayName,phone,pickupTime,orderNote,items:cart});
      const order=result.order;
      localStorage.removeItem('valora:liff:cart');
      localStorage.setItem('valora:liff:last_order', order.id);
      nav('/liff/success');
    }catch(e:any){setError(e.message||'Failed');}
  }
  return <div className="max-w-md mx-auto p-4 space-y-3"><h1 className="text-xl font-bold">Confirm Order</h1><input className="form-input" placeholder="phone" value={phone} onChange={(e)=>setPhone(e.target.value)} /><input type="datetime-local" className="form-input" value={pickupTime} onChange={(e)=>setPickupTime(e.target.value)} /><textarea className="form-input" placeholder="order note" value={orderNote} onChange={(e)=>setOrderNote(e.target.value)} />{error?<p className="text-sm text-red-600">{error}</p>:null}<button onClick={confirm} className="bg-primary text-primary-foreground px-4 py-2 rounded">Place order</button></div>;
}

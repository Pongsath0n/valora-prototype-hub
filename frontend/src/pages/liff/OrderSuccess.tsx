import { useEffect, useState } from "react";
import { customerApi, type CustomerOrderSummary } from "@/services/customerApi";

export default function OrderSuccessPage(){
 const id=localStorage.getItem('valora:liff:last_order');
 const [order, setOrder] = useState<CustomerOrderSummary | null>(null);
 const [error, setError] = useState("");

 useEffect(() => {
  if (!id) return;
  customerApi.getOrder(id).then(setOrder).catch((e:any)=>setError(e?.message||"Failed to load order"));
 }, [id]);

 return <div className="max-w-md mx-auto p-4"><h1 className="text-xl font-bold">สั่งซื้อสำเร็จ</h1><p className="text-sm mt-2">Order ID: {id}</p>{order?<><p className="text-sm mt-1">Status: {order.status}</p><p className="text-sm mt-1">Payment: {order.payment_status}</p><p className="text-sm mt-1">Total: ฿{order.total_amount}</p></>:null}{error?<p className="text-sm mt-1 text-red-600">{error}</p>:null}<p className="text-sm mt-1">LINE notification remains mock/dev in this phase.</p></div>
}

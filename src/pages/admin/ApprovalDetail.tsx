import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { approveSlip, getOrderDetail, patchOrderStatus, rejectSlip } from "@/features/store/adminApi";

function Badge({ t }: { t: string }) { return <span className="px-2 py-1 rounded text-xs border">{t}</span>; }

export default function OrderDetailAdminPage() {
  const { requestId } = useParams();
  const orderId = requestId as string;
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  async function refresh() { setLoading(true); try { setRow(await getOrderDetail(orderId)); } catch (e:any) { setError(e.message||"โหลดรายละเอียดไม่สำเร็จ"); } finally { setLoading(false);} }
  useEffect(() => { refresh(); }, [orderId]);

  const payment = row?.payments?.[0];

  async function onApprove() { if(!payment?.id) return; if(!confirm("ยืนยันอนุมัติสลิป?")) return; await approveSlip(payment.id); await refresh(); }
  async function onReject() { if(!payment?.id) return; if(!rejectReason.trim()) return alert("กรุณากรอกเหตุผล"); if(!confirm("ยืนยันปฏิเสธสลิป?")) return; await rejectSlip(payment.id, rejectReason); await refresh(); }
  async function onStatus(next: "preparing"|"ready"|"completed") { if(!confirm(`ยืนยันเปลี่ยนสถานะเป็น ${next}?`)) return; await patchOrderStatus(orderId, next); await refresh(); }
  async function onCancel() { if(!cancelReason.trim()) return alert("กรุณากรอกเหตุผลยกเลิก"); if(!confirm("ยืนยันยกเลิกออเดอร์?")) return; await patchOrderStatus(orderId, "cancelled", cancelReason); await refresh(); }

  return <AdminLayout><div className="space-y-4"><div className="flex items-center justify-between"><h1 className="page-title">Order Detail</h1><Link to="/admin/approvals" className="underline text-sm">กลับคิวชำระเงิน</Link></div>
    {loading ? <p className="text-sm">กำลังโหลด...</p> : null}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    {row ? <>
      <div className="stat-card space-y-1 text-sm"><p>order_no: <b>{row.order_no || row.id}</b></p><p>ลูกค้า: {row.customers?.display_name || "-"} / {row.customers?.phone || "-"}</p><p>pickup_time: {row.pickup_time || "-"}</p><p>total_amount: {row.total_amount ?? 0}</p><p>order_status: <Badge t={row.order_status || "-"} /></p><p>payment_status: <Badge t={row.payment_status || "-"} /></p><p>payments.status: <Badge t={payment?.status || "-"} /></p></div>
      <div className="stat-card"><h2 className="font-semibold mb-2">Slip</h2>{payment?.slip_url ? <a href={payment.slip_url} target="_blank" className="underline">เปิดลิงก์สลิป</a> : <p className="text-sm text-muted-foreground">ไม่มีสลิป</p>}</div>
      <div className="stat-card space-y-2"><h2 className="font-semibold">Payment Actions</h2><div className="flex gap-2"><button onClick={onApprove} className="px-3 py-2 rounded bg-green-600 text-white">Approve Slip</button></div><div className="flex gap-2"><input value={rejectReason} onChange={(e)=>setRejectReason(e.target.value)} className="form-input" placeholder="เหตุผลปฏิเสธ"/><button onClick={onReject} className="px-3 py-2 rounded bg-red-600 text-white">Reject Slip</button></div></div>
      <div className="stat-card space-y-2"><h2 className="font-semibold">Order Workflow</h2><div className="flex flex-wrap gap-2"><button onClick={()=>onStatus("preparing")} className="px-3 py-2 rounded border">Mark Preparing</button><button onClick={()=>onStatus("ready")} className="px-3 py-2 rounded border">Mark Ready</button><button onClick={()=>onStatus("completed")} className="px-3 py-2 rounded border">Mark Completed</button></div><div className="flex gap-2"><input value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} className="form-input" placeholder="เหตุผลยกเลิก"/><button onClick={onCancel} className="px-3 py-2 rounded bg-red-700 text-white">Cancel Order</button></div></div>
    </> : null}
  </div></AdminLayout>;
}

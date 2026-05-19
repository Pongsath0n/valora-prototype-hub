import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { getAdminOrders } from "@/features/store/adminApi";

function Badge({ t }: { t: string }) { return <span className="px-2 py-1 rounded text-xs border">{t}</span>; }

export default function OrderQueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderStatus, setOrderStatus] = useState("");

  useEffect(() => {
    setLoading(true);
    getAdminOrders({ orderStatus: orderStatus || undefined }).then(setRows).catch((e) => setError(e.message || "โหลดไม่สำเร็จ")).finally(() => setLoading(false));
  }, [orderStatus]);

  return <AdminLayout><div className="space-y-4"><h1 className="page-title">Order Queue</h1>
    <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className="form-input max-w-xs"><option value="">ทุกสถานะ</option><option value="pending_payment">pending_payment</option><option value="accepted">accepted</option><option value="preparing">preparing</option><option value="ready">ready</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select>
    {loading ? <p className="text-sm">กำลังโหลด...</p> : null}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    <div className="stat-card overflow-auto"><table className="data-table min-w-[980px]"><thead><tr><th>order_no</th><th>ลูกค้า</th><th>โทร</th><th>pickup_time</th><th>total_amount</th><th>order_status</th><th>payment_status</th><th/></tr></thead><tbody>{rows.map((r)=><tr key={r.id}><td>{r.order_no||r.id}</td><td>{r.customer?.display_name||r.customers?.display_name||"-"}</td><td>{r.customer?.phone||r.customers?.phone||"-"}</td><td>{r.pickup_time||"-"}</td><td>{r.total_amount??0}</td><td><Badge t={r.order_status||"-"}/></td><td><Badge t={r.payment_status||"-"}/></td><td><Link className="underline" to={`/admin/orders/${r.id}`}>เปิด</Link></td></tr>)}</tbody></table></div>
  </div></AdminLayout>;
}

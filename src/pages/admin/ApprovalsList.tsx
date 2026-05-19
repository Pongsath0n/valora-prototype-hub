import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { getPendingPayments } from "@/features/store/adminApi";

function Badge({ t }: { t: string }) { return <span className="px-2 py-1 rounded text-xs border">{t}</span>; }

export default function PaymentReviewQueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getPendingPayments().then(setRows).catch((e) => setError(e.message || "โหลดคิวชำระเงินไม่สำเร็จ")).finally(() => setLoading(false));
  }, []);

  return <AdminLayout><div className="space-y-4"><h1 className="page-title">Payment Review Queue</h1>
    {loading ? <p className="text-sm">กำลังโหลด...</p> : null}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    <div className="stat-card overflow-auto"><table className="data-table min-w-[980px]"><thead><tr><th>payment_id</th><th>order_no</th><th>ลูกค้า</th><th>amount</th><th>payments.status</th><th>slip</th><th/></tr></thead><tbody>{rows.map((p)=><tr key={p.id}><td>{p.id}</td><td>{p.orders?.order_no||p.order_id}</td><td>{p.customers?.display_name||"-"}</td><td>{p.amount}</td><td><Badge t={p.status||"-"}/></td><td>{p.slip_url?<a href={p.slip_url} target="_blank" className="underline">เปิดสลิป</a>:"-"}</td><td><Link className="underline" to={`/admin/orders/${p.order_id}`}>รีวิว</Link></td></tr>)}</tbody></table></div>
  </div></AdminLayout>;
}

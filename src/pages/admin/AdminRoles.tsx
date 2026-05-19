import AdminLayout from "@/components/AdminLayout";
import { useRoleGuard } from "@/lib/guards";

const rows = [
  ["Dashboard access","✅","✅","✅","⚠️"],
  ["Admin access","✅","✅","❌","❌"],
  ["User management","✅","✅","❌","❌"],
  ["Store settings","✅","✅","✅","❌"],
  ["Menu management","✅","✅","✅","❌"],
  ["Ingredient management","✅","✅","✅","❌"],
  ["Recipe costing","✅","✅","✅","❌"],
  ["Order management","✅","✅","✅","✅"],
  ["POS access","✅","✅","✅","✅"],
  ["Report access","✅","✅","✅","❌"],
  ["Insight access","✅","✅","✅","❌"],
  ["Sales channel settings","✅","✅","✅","❌"],
  ["System health access","✅","✅","❌","❌"],
  ["Audit log access","✅","✅","❌","❌"],
];
export default function AdminRolesPage(){const {checking,accessDenied}=useRoleGuard(["owner","admin"]);if(checking)return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;if(accessDenied)return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;return <AdminLayout><div className="space-y-4"><h1 className="page-title">จัดการสิทธิ์</h1><div className="stat-card overflow-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Permission</th><th>owner</th><th>admin</th><th>manager</th><th>staff</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}>{r.map(c=><td key={String(c)}>{c}</td>)}</tr>)}</tbody></table></div></div></AdminLayout>}

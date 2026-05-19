import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/lib/supabase";
import { useRoleGuard } from "@/lib/guards";

export default function AdminUsersPage() {
  const { checking, accessDenied } = useRoleGuard(["owner", "admin"]);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (!checking && !accessDenied) supabase.from("profiles").select("id,email,full_name,role,created_at,store_id").then(({data})=>setRows(data??[])); }, [checking, accessDenied]);
  if (checking) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  return <AppLayout><div className="space-y-4"><h1 className="page-title">จัดการผู้ใช้</h1><div className="stat-card overflow-auto"><table className="data-table min-w-[900px]"><thead><tr><th>email</th><th>full_name</th><th>role</th><th>store</th><th>created_at</th><th>actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.email}</td><td>{r.full_name??"-"}</td><td>{r.role}</td><td>{r.store_id??"-"}</td><td>{r.created_at??"-"}</td><td><button className="text-xs underline mr-2">View user</button><button className="text-xs mr-2" disabled>แก้ไขสิทธิ์ (เร็ว ๆ นี้)</button><button className="text-xs" disabled>Deactivate (เร็ว ๆ นี้)</button></td></tr>)}</tbody></table></div></div></AppLayout>;
}

import { useEffect, useState } from "react";
import SystemLayout from "@/components/system/SystemLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { loadProfiles, type ProfileRow } from "@/services/systemConsoleService";

export default function SystemUsersPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"ok" | "empty" | "error">("empty");

  useEffect(() => {
    loadProfiles()
      .then((res) => {
        if (res.status === "ok" && res.rows.length > 0) {
          setRows(res.rows);
          setState("ok");
        } else {
          setState("empty");
        }
      })
      .catch(() => setState("error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SystemLayout
      title="จัดการผู้ใช้"
      subtitle="ดูบัญชีผู้ใช้ที่เข้าใช้งานระบบ Valora (read-only)"
    >
      {loading ? <LoadingState label="กำลังโหลดรายการผู้ใช้..." /> : null}

      {!loading && state === "ok" ? (
        <section className="stat-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title mb-0">ผู้ใช้ทั้งหมด</h2>
            <p className="text-xs text-muted-foreground">แสดงข้อมูลจาก Supabase โปรไฟล์ (read-only)</p>
          </div>
          <DataTable
            columns={[
              { key: "email", header: "Email" },
              { key: "full_name", header: "ชื่อ-สกุล" },
              {
                key: "role",
                header: "Role",
                render: (r) => <StatusBadge label={String(r.role ?? "-")} tone="info" />,
              },
              { key: "store_id", header: "Store ID" },
              {
                key: "created_at",
                header: "สร้างเมื่อ",
                render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : "-"),
              },
            ]}
            rows={rows}
          />
        </section>
      ) : null}

      {!loading && state !== "ok" ? (
        <EmptyState
          title="ยังไม่พบข้อมูลผู้ใช้งาน หรือ schema ยังไม่พร้อม"
          description="เชื่อมต่อ Supabase profiles แล้วกลับมาตรวจสอบอีกครั้ง (หน้านี้เป็น read-only)"
        />
      ) : null}
    </SystemLayout>
  );
}

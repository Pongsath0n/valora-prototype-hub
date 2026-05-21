import { useEffect, useState } from "react";
import SystemLayout from "@/components/system/SystemLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { loadAuditBuckets, type AuditLogRow } from "@/services/systemConsoleService";

type BucketKey = "orders" | "payments" | "line_notifications";

const bucketLabels: Record<BucketKey, string> = {
  orders: "Order Status Logs",
  payments: "Payment Status Logs",
  line_notifications: "LINE Notification Logs",
};

export default function SystemAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<Record<BucketKey, AuditLogRow[]>>({
    orders: [],
    payments: [],
    line_notifications: [],
  });
  const [status, setStatus] = useState<"ok" | "partial" | "unavailable" | "empty">("empty");

  useEffect(() => {
    loadAuditBuckets()
      .then((res) => {
        setBuckets(res.buckets as Record<BucketKey, AuditLogRow[]>);
        if (res.status === "ok" && Object.values(res.buckets).some((rows) => rows.length)) {
          setStatus("ok");
        } else if (res.status === "unavailable") {
          setStatus("unavailable");
        } else if (Object.values(res.buckets).some((rows) => rows.length)) {
          setStatus("partial");
        } else {
          setStatus("empty");
        }
      })
      .catch(() => setStatus("unavailable"))
      .finally(() => setLoading(false));
  }, []);

  const hasRows = Object.values(buckets).some((rows) => rows.length);

  return (
    <SystemLayout
      title="บันทึกเหตุการณ์"
      subtitle="Audit logs ของการกระทำที่สำคัญในระบบ (read-only)"
    >
      {loading ? <LoadingState label="กำลังโหลด audit logs..." /> : null}

      {!loading && status !== "ok" && !hasRows ? (
        <EmptyState
          title="ยังไม่มีข้อมูลบันทึกเหตุการณ์"
          description="ยังไม่มี global activity_logs ในระบบปัจจุบัน โดยระบบสามารถเริ่มตรวจสอบจาก order_status_logs, payment_status_logs และ line_notification_logs ได้"
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(bucketLabels) as BucketKey[]).map((key) => (
          <section key={key} className="stat-card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="section-title mb-0">{bucketLabels[key]}</h2>
              <StatusBadge
                label={buckets[key].length ? `${buckets[key].length} rows` : status === "unavailable" ? "unavailable" : "no data"}
                tone={buckets[key].length ? "info" : status === "unavailable" ? "danger" : "neutral"}
              />
            </div>
            {buckets[key].length ? (
              <DataTable
                columns={[
                  { key: "id", header: "ID" },
                  { key: "ref", header: "Ref" },
                  { key: "status", header: "สถานะ", render: (r) => <StatusBadge label={r.status} tone="info" /> },
                  {
                    key: "created_at",
                    header: "เวลา",
                    render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : "-"),
                  },
                ]}
                rows={buckets[key]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">ไม่มีข้อมูลในหมวดนี้</p>
            )}
          </section>
        ))}
      </div>
    </SystemLayout>
  );
}

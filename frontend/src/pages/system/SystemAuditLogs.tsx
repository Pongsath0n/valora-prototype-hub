import { useCallback, useEffect, useMemo, useState } from "react";
import SystemLayout from "@/components/system/SystemLayout";
import DataTable from "@/components/shared/DataTable";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { loadAuditBuckets, type AuditLogEntry } from "@/services/systemConsoleService";

type BucketKey = "orders" | "payments" | "line_notifications";

const bucketLabels: Record<BucketKey, string> = {
  orders: "Order Status Logs",
  payments: "Payment Status Logs",
  line_notifications: "LINE Notification Logs",
};

export default function SystemAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<Record<BucketKey, AuditLogEntry[]>>({
    orders: [],
    payments: [],
    line_notifications: [],
  });
  const [status, setStatus] = useState<"ok" | "partial" | "unavailable" | "empty">("empty");
  const [bucketErrors, setBucketErrors] = useState<Partial<Record<BucketKey, string>>>({});
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshBuckets = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await loadAuditBuckets();
      setBuckets(res.buckets as Record<BucketKey, AuditLogEntry[]>);
      setBucketErrors((res.errors ?? {}) as Partial<Record<BucketKey, string>>);
      const hasRows = Object.values(res.buckets).some((rows) => rows.length);
      if (res.status === "ok" && hasRows) {
        setStatus("ok");
      } else if (res.status === "unavailable") {
        setStatus("unavailable");
        setErrorMessage("Supabase audit tables ไม่พร้อมใช้งานขณะนี้");
      } else if (hasRows) {
        setStatus("partial");
      } else {
        setStatus("empty");
      }
    } catch (error) {
      void error;
      setStatus("unavailable");
      setErrorMessage("ไม่สามารถเชื่อมต่อกับระบบ audit logs");
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    void refreshBuckets();
  }, [refreshBuckets]);

  const hasRows = useMemo(() => Object.values(buckets).some((rows) => rows.length), [buckets]);
  const lastCheckedDisplay = lastChecked ? lastChecked.toLocaleString("th-TH") : "ยังไม่เคยตรวจสอบ";
  const hasBucketErrors = Object.keys(bucketErrors).length > 0;
  const emptyStateDescription = status === "unavailable"
    ? (errorMessage ? `${errorMessage} (ตรวจสอบล่าสุด ${lastCheckedDisplay})` : `ไม่สามารถโหลดบันทึกได้ (ตรวจสอบล่าสุด ${lastCheckedDisplay})`)
    : hasBucketErrors
      ? `อ่านตารางบันทึกบางส่วนไม่สำเร็จ (อาจยังไม่มีตารางหรือไม่มีสิทธิ์อ่าน) ตรวจสอบล่าสุด ${lastCheckedDisplay}`
      : `ระบบเชื่อมต่อกับตาราง order_status_logs / payment_status_logs / line_notification_logs แล้ว แต่ยังไม่มีเหตุการณ์ที่ถูกบันทึก ตรวจสอบล่าสุด ${lastCheckedDisplay}`;

  return (
    <SystemLayout
      title="บันทึกเหตุการณ์"
      subtitle="Audit logs ของการกระทำที่สำคัญในระบบ (read-only)"
    >
      {loading ? <LoadingState label="กำลังโหลด audit logs..." /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">ตรวจสอบล่าสุด: {lastCheckedDisplay}</p>
        <button
          type="button"
          onClick={() => void refreshBuckets()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold"
          disabled={loading}
        >
          โหลดข้อมูลล่าสุด
        </button>
      </div>

      {!loading && status !== "ok" && !hasRows ? (
        <EmptyState
          title={status === "unavailable" ? "ไม่สามารถโหลดบันทึกเหตุการณ์" : "ยังไม่มีข้อมูลบันทึกเหตุการณ์"}
          description={emptyStateDescription}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(bucketLabels) as BucketKey[]).map((key) => (
          <section key={key} className="stat-card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="section-title mb-0">{bucketLabels[key]}</h2>
              <StatusBadge
                label={
                  buckets[key].length
                    ? `${buckets[key].length} rows`
                    : status === "unavailable"
                      ? "unavailable"
                      : bucketErrors[key]
                        ? "อ่านไม่ได้"
                        : "no data"
                }
                tone={
                  buckets[key].length
                    ? "info"
                    : status === "unavailable" || bucketErrors[key]
                      ? "danger"
                      : "neutral"
                }
              />
            </div>
            {buckets[key].length ? (
              <DataTable
                columns={[
                  { key: "event_type", header: "เหตุการณ์" },
                  {
                    key: "reference",
                    header: "อ้างอิง",
                    render: (row: AuditLogEntry) => row.payment_id || row.order_id || "-",
                  },
                  {
                    key: "actor",
                    header: "ผู้กระทำ",
                    render: (row: AuditLogEntry) =>
                      row.actor_role ? `${row.actor_role}${row.actor_id ? ` (${row.actor_id})` : ""}` : row.actor_id || "system",
                  },
                  {
                    key: "message",
                    header: "รายละเอียด",
                    render: (row: AuditLogEntry) => row.message || "-",
                  },
                  {
                    key: "created_at",
                    header: "เวลา",
                    render: (row: AuditLogEntry) => (row.created_at ? new Date(row.created_at).toLocaleString() : "-"),
                  },
                ]}
                rows={buckets[key]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {bucketErrors[key]
                  ? "อ่านตารางนี้ไม่สำเร็จ — อาจยังไม่มีตารางใน Supabase หรือบัญชีนี้ไม่มีสิทธิ์อ่าน"
                  : "เชื่อมต่อแล้ว แต่ยังไม่มีเหตุการณ์ในหมวดนี้"}
              </p>
            )}
          </section>
        ))}
      </div>
    </SystemLayout>
  );
}

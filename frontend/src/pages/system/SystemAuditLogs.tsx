import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RefreshCw, Search } from "lucide-react";
import SystemLayout from "@/components/system/SystemLayout";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import AuditLogTimeline from "@/components/system/AuditLogTimeline";
import AuditLogDetailDrawer from "@/components/system/AuditLogDetailDrawer";
import {
  AUDIT_SOURCES,
  CATEGORY_LABELS,
  SOURCE_META,
  categorizeEvent,
  flattenBuckets,
  shortRef,
  type AuditSource,
  type EventCategory,
  type FlatAuditLog,
} from "@/components/system/auditLogUtils";
import { loadAuditBuckets, type AuditLogEntry } from "@/services/systemConsoleService";

type SourceFilter = "all" | AuditSource;
type CategoryFilter = "all" | EventCategory;

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "orders", label: SOURCE_META.orders.label },
  { value: "payments", label: SOURCE_META.payments.label },
  { value: "line_notifications", label: SOURCE_META.line_notifications.label },
];

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "success", label: CATEGORY_LABELS.success },
  { value: "failed", label: CATEGORY_LABELS.failed },
  { value: "pending", label: CATEGORY_LABELS.pending },
  { value: "change", label: CATEGORY_LABELS.change },
  { value: "info", label: CATEGORY_LABELS.info },
];

export default function SystemAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<Record<AuditSource, AuditLogEntry[]>>({
    orders: [],
    payments: [],
    line_notifications: [],
  });
  const [status, setStatus] = useState<"ok" | "partial" | "unavailable" | "empty">("empty");
  const [bucketErrors, setBucketErrors] = useState<Partial<Record<AuditSource, string>>>({});
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FlatAuditLog | null>(null);

  const refreshBuckets = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await loadAuditBuckets();
      setBuckets(res.buckets as Record<AuditSource, AuditLogEntry[]>);
      setBucketErrors((res.errors ?? {}) as Partial<Record<AuditSource, string>>);
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

  const allRows = useMemo(() => flattenBuckets(buckets), [buckets]);
  const hasRows = allRows.length > 0;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      if (categoryFilter !== "all" && categorizeEvent(row.event_type).category !== categoryFilter) return false;
      if (q) {
        const haystack = [
          row.event_type,
          row.message,
          row.reference,
          shortRef(row.reference),
          row.order_id,
          row.payment_id,
          row.actor_id,
          row.actor_role,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, sourceFilter, categoryFilter, query]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">ตรวจสอบล่าสุด: {lastCheckedDisplay}</p>
        <button
          type="button"
          onClick={() => void refreshBuckets()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          โหลดข้อมูลล่าสุด
        </button>
      </div>

      {/* Per-source status summary — keeps the honest distinction between
          unreadable tables and genuinely empty ones from the bucketed view. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {AUDIT_SOURCES.map((key) => {
          const count = buckets[key]?.length ?? 0;
          const unreadable = Boolean(bucketErrors[key]) || status === "unavailable";
          return (
            <div key={key} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
              <span className="text-sm font-medium text-foreground">{SOURCE_META[key].label}</span>
              <StatusBadge
                label={count ? `${count} รายการ` : unreadable ? "อ่านไม่ได้" : "ไม่มีข้อมูล"}
                tone={count ? SOURCE_META[key].tone : unreadable ? "danger" : "neutral"}
              />
            </div>
          );
        })}
      </div>

      {loading ? <LoadingState label="กำลังโหลด audit logs..." /> : null}

      {!loading && !hasRows ? (
        <EmptyState
          title={status === "unavailable" ? "ไม่สามารถโหลดบันทึกเหตุการณ์" : "ยังไม่มีข้อมูลบันทึกเหตุการณ์"}
          description={emptyStateDescription}
        />
      ) : null}

      {!loading && hasRows ? (
        <div className="space-y-3">
          {/* Filters — client-side only, over already-loaded data. */}
          <div className="space-y-3 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามแหล่งที่มา">
                {SOURCE_FILTERS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSourceFilter(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      sourceFilter === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="ml-auto flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:flex-none">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหารหัสอ้างอิง / ข้อความ / ผู้กระทำ"
                  aria-label="ค้นหาบันทึกเหตุการณ์"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามสถานะเหตุการณ์">
              {CATEGORY_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategoryFilter(opt.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    categoryFilter === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            แสดง {filteredRows.length} จาก {allRows.length} รายการ
          </p>

          {filteredRows.length ? (
            <AuditLogTimeline rows={filteredRows} onSelect={setSelected} />
          ) : (
            <EmptyState
              title="ไม่พบรายการที่ตรงกับตัวกรอง"
              description="ลองล้างคำค้นหาหรือเลือกตัวกรองอื่น เพื่อดูบันทึกเหตุการณ์ทั้งหมด"
            />
          )}
        </div>
      ) : null}

      {/* Retention / export policy note — informational only, no working action. */}
      <div className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <span className="font-semibold text-foreground">นโยบาย (วางแผน):</span>{" "}
          ควรเก็บข้อมูล audit log ไว้อย่างน้อย 30 วัน และมีแผนส่งออก (export) เป็นรายเดือน — ฟีเจอร์ส่งออกยังอยู่ในขั้นวางแผน ยังไม่เปิดใช้งานในหน้านี้
        </p>
      </div>

      <AuditLogDetailDrawer log={selected} onClose={() => setSelected(null)} />
    </SystemLayout>
  );
}

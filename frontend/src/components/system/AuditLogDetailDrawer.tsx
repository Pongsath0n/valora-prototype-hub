import { useEffect } from "react";
import { X } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import CopyButton from "@/components/system/CopyButton";
import {
  SOURCE_META,
  absoluteTimeTh,
  actorLabel,
  categorizeEvent,
  CATEGORY_LABELS,
  humanizeEvent,
  relativeTimeTh,
  safeMetadataEntries,
  type FlatAuditLog,
} from "@/components/system/auditLogUtils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export default function AuditLogDetailDrawer({
  log,
  onClose,
}: {
  log: FlatAuditLog | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!log) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [log, onClose]);

  if (!log) return null;

  const source = SOURCE_META[log.source];
  const event = categorizeEvent(log.event_type);
  const metadata = safeMetadataEntries(log.metadata);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="รายละเอียดบันทึกเหตุการณ์"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-card shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b px-4 py-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {source ? <StatusBadge label={source.badge} tone={source.tone} /> : null}
              <StatusBadge label={CATEGORY_LABELS[event.category]} tone={event.tone} />
            </div>
            <h2 className="break-words text-base font-semibold text-foreground">
              {humanizeEvent(log.event_type)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดรายละเอียด"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <Field label="รหัสอ้างอิงแบบเต็ม">
            {log.reference ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                  {log.reference}
                </code>
                <CopyButton value={log.reference} />
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="ออเดอร์">
              <span className="break-all font-mono text-xs">{log.order_id || "—"}</span>
            </Field>
            <Field label="การชำระเงิน">
              <span className="break-all font-mono text-xs">{log.payment_id || "—"}</span>
            </Field>
          </div>

          <Field label="ผู้กระทำ">{actorLabel(log)}</Field>

          <Field label="เวลา">
            <div>
              <p>{absoluteTimeTh(log.created_at)}</p>
              {relativeTimeTh(log.created_at) ? (
                <p className="text-xs text-muted-foreground">{relativeTimeTh(log.created_at)}</p>
              ) : null}
            </div>
          </Field>

          <Field label="รายละเอียด">
            <p className="break-words whitespace-pre-wrap">{log.message || "—"}</p>
          </Field>

          {metadata.length ? (
            <Field label="ข้อมูลเพิ่มเติม (metadata)">
              <dl className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
                {metadata.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2 text-xs">
                    <dt className="break-words font-medium text-muted-foreground">{k}</dt>
                    <dd className="break-words font-mono text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </Field>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

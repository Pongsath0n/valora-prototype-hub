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
  shortRef,
  type FlatAuditLog,
} from "@/components/system/auditLogUtils";

export default function AuditLogTimeline({
  rows,
  onSelect,
}: {
  rows: FlatAuditLog[];
  onSelect: (log: FlatAuditLog) => void;
}) {
  return (
    <ul className="space-y-2" aria-label="รายการบันทึกเหตุการณ์">
      {rows.map((row) => {
        const source = SOURCE_META[row.source];
        const event = categorizeEvent(row.event_type);
        return (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="w-full rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`ดูรายละเอียด ${humanizeEvent(row.event_type)}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {source ? <StatusBadge label={source.badge} tone={source.tone} /> : null}
                <StatusBadge label={CATEGORY_LABELS[event.category]} tone={event.tone} />
                <span className="min-w-0 break-words font-medium text-foreground">
                  {humanizeEvent(row.event_type)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {row.reference ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground/80">อ้างอิง</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      {shortRef(row.reference)}
                    </code>
                    <CopyButton value={row.reference} />
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground/80">ผู้กระทำ</span>
                  <span className="text-foreground">{actorLabel(row)}</span>
                </span>
                <span className="ml-auto whitespace-nowrap" title={absoluteTimeTh(row.created_at)}>
                  {relativeTimeTh(row.created_at) || absoluteTimeTh(row.created_at)}
                </span>
              </div>

              {row.message ? (
                <p className="mt-1.5 line-clamp-2 break-words text-sm text-muted-foreground">{row.message}</p>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

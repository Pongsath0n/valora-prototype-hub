import type { StatusTone } from "@/lib/format";
import type { AuditLogEntry } from "@/services/systemConsoleService";

// ─── Sources ────────────────────────────────────────────────────────────────

export type AuditSource = "orders" | "payments" | "line_notifications";

export const AUDIT_SOURCES: AuditSource[] = ["orders", "payments", "line_notifications"];

export const SOURCE_META: Record<AuditSource, { label: string; badge: string; tone: StatusTone }> = {
  orders: { label: "ออเดอร์", badge: "Order log", tone: "info" },
  payments: { label: "การชำระเงิน", badge: "Payment log", tone: "success" },
  line_notifications: { label: "LINE", badge: "LINE notification", tone: "warning" },
};

export type FlatAuditLog = AuditLogEntry & {
  source: AuditSource;
  reference: string | null;
  key: string;
};

/**
 * Merge the three audit buckets into a single timeline, newest first.
 * Pure client-side reshaping — does not change the data source or API behaviour.
 */
export function flattenBuckets(buckets: Record<AuditSource, AuditLogEntry[]>): FlatAuditLog[] {
  const rows: FlatAuditLog[] = [];
  AUDIT_SOURCES.forEach((source) => {
    (buckets[source] ?? []).forEach((entry, idx) => {
      rows.push({
        ...entry,
        source: (entry.source as AuditSource) ?? source,
        reference: entry.payment_id || entry.order_id || null,
        key: entry.id ? `${source}:${entry.id}` : `${source}:${idx}`,
      });
    });
  });
  rows.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return rows;
}

// ─── Reference shortening ─────────────────────────────────────────────────────

/**
 * Shorten a long reference / UUID for the main row.
 * @example shortRef("348544d2-...-452e") → "348544d2…452e"
 */
export function shortRef(value: string | null | undefined): string {
  if (!value) return "—";
  const v = String(value);
  if (v.length <= 12) return v;
  return `${v.slice(0, 8)}…${v.slice(-3)}`;
}

// ─── Time ─────────────────────────────────────────────────────────────────────

/**
 * Thai relative time without any extra dependency.
 * @example relativeTimeTh(fiveMinAgo) → "เมื่อ 5 นาทีที่แล้ว"
 */
export function relativeTimeTh(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.round((now - then) / 1000);
  if (diff < 0) return "อีกสักครู่";
  if (diff < 60) return "เมื่อสักครู่";
  const min = Math.floor(diff / 60);
  if (min < 60) return `เมื่อ ${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `เมื่อ ${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `เมื่อ ${day} วันที่แล้ว`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `เมื่อ ${mo} เดือนที่แล้ว`;
  return `เมื่อ ${Math.floor(mo / 12)} ปีที่แล้ว`;
}

/** Absolute Thai-readable date + time (no raw ISO string in the UI). */
export function absoluteTimeTh(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Event categorisation ─────────────────────────────────────────────────────

export type EventCategory = "success" | "failed" | "pending" | "change" | "info";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  success: "สำเร็จ",
  failed: "ล้มเหลว",
  pending: "รอดำเนินการ",
  change: "เปลี่ยนสถานะ",
  info: "ข้อมูล",
};

export function categorizeEvent(eventType: string | null | undefined): { category: EventCategory; tone: StatusTone } {
  const e = (eventType ?? "").toLowerCase();
  if (/(fail|error|reject|cancel|void|decline|unpaid|expired)/.test(e)) return { category: "failed", tone: "danger" };
  if (/(success|paid|approve|complete|deliver|sent|fulfill|ready|verified|\bok\b)/.test(e)) return { category: "success", tone: "success" };
  if (/(pending|wait|submit|upload|review|queue|retry|process)/.test(e)) return { category: "pending", tone: "warning" };
  if (/(status|change|update|transition)/.test(e)) return { category: "change", tone: "info" };
  return { category: "info", tone: "neutral" };
}

/** Turn snake_case / dotted event identifiers into readable text. */
export function humanizeEvent(eventType: string | null | undefined): string {
  if (!eventType) return "เหตุการณ์ไม่ระบุชื่อ";
  return String(eventType).replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
}

export function actorLabel(entry: Pick<AuditLogEntry, "actor_role" | "actor_id">): string {
  if (entry.actor_role) return `${entry.actor_role}${entry.actor_id ? ` (${shortRef(entry.actor_id)})` : ""}`;
  if (entry.actor_id) return shortRef(entry.actor_id);
  return "ระบบ (system)";
}

// ─── Metadata safety ──────────────────────────────────────────────────────────

const SECRET_KEY_RE = /(token|secret|password|authorization|api[_-]?key|access[_-]?key|credential|cookie|signature|private|bearer)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

/**
 * Produce display-safe metadata pairs for the detail view.
 * Secret-looking keys are masked so tokens / env values are never exposed.
 */
export function safeMetadataEntries(metadata: Record<string, unknown> | null | undefined): [string, string][] {
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata).map(([k, v]) => {
    if (isSecretKey(k)) return [k, "•••••• (ซ่อนเพื่อความปลอดภัย)"] as [string, string];
    let val: string;
    if (v === null || v === undefined) val = "—";
    else if (typeof v === "object") {
      try {
        val = JSON.stringify(v);
      } catch {
        val = "[object]";
      }
    } else val = String(v);
    if (val.length > 300) val = `${val.slice(0, 300)}…`;
    return [k, val] as [string, string];
  });
}

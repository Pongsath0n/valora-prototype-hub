import { getSupabase } from "@/lib/supabase";

export type EndpointState = {
  status: string;
  data?: unknown;
  error?: string;
};

export type HealthSummary = {
  backend: EndpointState;
  environment: EndpointState;
  auth: EndpointState;
  database: EndpointState;
  lineReady: EndpointState;
  baseUrl: string;
};

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function fetchEndpoint(path: string): Promise<EndpointState> {
  const url = `${BACKEND_BASE}${path}`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    const status = (data as Record<string, any>)?.status ?? (res.ok ? "ok" : "error");
    return { status, data };
  } catch (error) {
    return { status: "unavailable", error: "fetch_failed" };
  }
}

export async function loadBackendHealth(): Promise<HealthSummary> {
  const [backend, environment, auth, database, lineReady] = await Promise.all([
    fetchEndpoint("/health"),
    fetchEndpoint("/health/env"),
    fetchEndpoint("/health/auth"),
    fetchEndpoint("/health/db"),
    fetchEndpoint("/health/line-ready"),
  ]);

  return {
    backend,
    environment,
    auth,
    database,
    lineReady,
    baseUrl: BACKEND_BASE,
  };
}

export type ProfileRow = {
  email: string | null;
  full_name: string | null;
  role: string | null;
  store_id: string | null;
  created_at: string | null;
};

export async function loadProfiles(limit = 100): Promise<{ status: "ok" | "error" | "unavailable"; rows: ProfileRow[]; reason?: string }> {
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from("profiles")
      .select("email, full_name, role, store_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { status: "error", rows: [], reason: "query_failed" };
    }

    return { status: "ok", rows: data ?? [] };
  } catch (err) {
    return { status: "unavailable", rows: [], reason: "supabase_unavailable" };
  }
}

type AuditBucketName = "orders" | "payments" | "line_notifications";

export type AuditLogRow = {
  id: string;
  ref: string;
  status: string;
  created_at: string;
  source: AuditBucketName;
};

type BucketResult = { source: AuditBucketName; rows: AuditLogRow[]; error?: string };

function mapLogRow(row: Record<string, any>, source: AuditBucketName, refKeys: string[]): AuditLogRow {
  const refKey = refKeys.find((key) => row[key] !== undefined) ?? refKeys[0] ?? "id";
  return {
    id: String(row.id ?? row[refKey] ?? "n/a"),
    ref: String(row[refKey] ?? "-"),
    status: String(row.status ?? row.state ?? row.result ?? row.event ?? "n/a"),
    created_at: String(row.created_at ?? row.inserted_at ?? row.timestamp ?? ""),
    source,
  };
}

async function fetchAuditBucket(source: AuditBucketName, table: string, refKeys: string[]): Promise<BucketResult> {
  try {
    const client = getSupabase();
    const { data, error } = await client.from(table).select("*").order("created_at", { ascending: false }).limit(30);

    if (error) {
      return { source, rows: [], error: "query_failed" };
    }

    const rows = (data ?? []).map((row) => mapLogRow(row as Record<string, any>, source, refKeys));
    return { source, rows };
  } catch (err) {
    return { source, rows: [], error: "supabase_unavailable" };
  }
}

export async function loadAuditBuckets(): Promise<{ status: "ok" | "partial" | "unavailable"; buckets: Record<AuditBucketName, AuditLogRow[]>; reason?: string }> {
  const defaults: Record<AuditBucketName, AuditLogRow[]> = {
    orders: [],
    payments: [],
    line_notifications: [],
  };

  const results = await Promise.all([
    fetchAuditBucket("orders", "order_status_logs", ["order_id", "id"]),
    fetchAuditBucket("payments", "payment_status_logs", ["payment_id", "order_id", "id"]),
    fetchAuditBucket("line_notifications", "line_notification_logs", ["customer_id", "line_user_id", "id"]),
  ]);

  const buckets: Record<AuditBucketName, AuditLogRow[]> = { ...defaults };
  const hadError = results.some((r) => r.error);
  let totalRows = 0;

  for (const result of results) {
    buckets[result.source] = result.rows;
    totalRows += result.rows.length;
  }

  if (results.some((r) => r.error === "supabase_unavailable")) {
    return { status: "unavailable", buckets, reason: "supabase_unavailable" };
  }

  if (totalRows > 0) {
    return { status: hadError ? "partial" : "ok", buckets, reason: hadError ? "some_queries_failed" : undefined };
  }

  return { status: hadError ? "partial" : "partial", buckets, reason: hadError ? "query_failed" : "no_logs_found" };
}

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
  storage: EndpointState;
  baseUrl: string;
};

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function fetchEndpoint(path: string): Promise<EndpointState> {
  const url = `${BACKEND_BASE}${path}`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    const status = (data as Record<string, unknown>)?.status ?? (res.ok ? "ok" : "error");
    return { status, data };
  } catch (error) {
    return { status: "unavailable", error: "fetch_failed" };
  }
}

export async function loadBackendHealth(): Promise<HealthSummary> {
  const [backend, environment, auth, database, lineReady, storage] = await Promise.all([
    fetchEndpoint("/health"),
    fetchEndpoint("/health/env"),
    fetchEndpoint("/health/auth"),
    fetchEndpoint("/health/db"),
    fetchEndpoint("/health/line-ready"),
    fetchEndpoint("/health/storage"),
  ]);

  return {
    backend,
    environment,
    auth,
    database,
    lineReady,
    storage,
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

export type AuditLogEntry = {
  id: string;
  source: AuditBucketName;
  event_type: string;
  order_id?: string | null;
  payment_id?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export async function loadAuditBuckets(): Promise<{
  status: "ok" | "partial" | "unavailable";
  buckets: Record<AuditBucketName, AuditLogEntry[]>;
  errors?: Partial<Record<AuditBucketName, string>>;
  reason?: string;
  limit?: number;
}> {
  return authRequest("/api/system/audit-logs");
}

export type SystemUserMembership = {
  id: string;
  store_id: string | null;
  store_name?: string | null;
  role?: string | null;
  created_at?: string | null;
};

export type SystemUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
  memberships: SystemUserMembership[];
};

export type SystemRoleId = "owner" | "admin" | "manager" | "staff";

export type SystemStoreRow = {
  id: string;
  name: string | null;
};

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("unauthorized");
  }
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.detail || "request_failed");
  }
  return body as T;
}

export const systemConsoleApi = {
  async listUsers(): Promise<{ items: SystemUserRow[] }> {
    return authRequest("/api/system/users");
  },
  async listStores(): Promise<{ items: SystemStoreRow[] }> {
    return authRequest("/api/system/stores");
  },
  async listRoles(): Promise<{ profile_roles: unknown[]; store_roles: unknown[] }> {
    return authRequest("/api/system/roles");
  },
  async updateUserRole(userId: string, role: SystemRoleId): Promise<{ status: string }> {
    return authRequest(`/api/system/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },
  async createStoreMember(userId: string, storeId: string, role: SystemRoleId): Promise<{ status: string }> {
    return authRequest("/api/system/store-members", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, store_id: storeId, role }),
    });
  },
  async updateStoreMember(memberId: string, role: SystemRoleId): Promise<{ status: string }> {
    return authRequest(`/api/system/store-members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },
  async deleteStoreMember(memberId: string): Promise<{ status: string }> {
    return authRequest(`/api/system/store-members/${memberId}`, { method: "DELETE" });
  },
};

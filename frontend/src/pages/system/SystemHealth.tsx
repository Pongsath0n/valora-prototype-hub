import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, HardDrive, Info, PlugZap, Server, ShieldCheck, WifiOff } from "lucide-react";
import SystemLayout from "@/components/system/SystemLayout";
import StatusBadge, { type BadgeTone } from "@/components/shared/StatusBadge";
import LoadingState from "@/components/shared/LoadingState";
import { loadBackendHealth, type HealthSummary } from "@/services/systemConsoleService";

type CardItem = {
  id?: string;
  title: string;
  icon: React.ElementType;
  status: string;
  tone: BadgeTone;
  body: React.ReactNode;
};

function toneFromStatus(status: string): BadgeTone {
  const normalized = (status || "").toLowerCase();
  if (["ok", "ready", "ready_candidate", "configured", "available"].includes(normalized)) return "success";
  if (["partial", "warning", "not_configured", "not_checked"].includes(normalized)) return "warning";
  if (["unavailable", "error", "action_required", "missing"].includes(normalized)) return "danger";
  if (["mock", "manual", "info", "planned", "not_enabled"].includes(normalized)) return "info";
  return "neutral";
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: BadgeTone }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <StatusBadge label={value} tone={tone} />
    </div>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBackendHealth()
      .then(setHealth)
      .finally(() => setLoading(false));
  }, []);

  const summaryCards = useMemo(() => {
    if (!health) return [];

    const envData = (health.environment.data as any) ?? {};
    const appEnvDetail = envData?.details?.app_env;
    const lineData = (health.lineReady.data as any) ?? {};
    const lineChecks = (lineData.checks as Record<string, any>) ?? {};
    const storage = (health.storage.data as any)?.storage;

    const sendMode = lineChecks.send_mode?.mode ?? lineData.mode ?? "mock";
    const liffStatus = lineChecks.liff?.status ?? "not_enabled";
    const storageBucketSummary = Array.isArray(storage?.buckets)
      ? `${storage.buckets.filter((b: any) => (b.status || "").toLowerCase() === "ok").length}/${storage.buckets.length} buckets ready`
      : "—";

    return [
      {
        title: "Backend API",
        status: health.backend.status,
        tone: toneFromStatus(health.backend.status),
        note: health.baseUrl,
      },
      {
        title: "Environment",
        status: health.environment.status,
        tone: toneFromStatus(health.environment.status),
        note: appEnvDetail
          ? `APP_ENV=${appEnvDetail.value || "unset"} • Local=development • Railway=production`
          : "กำลังดึงค่า APP_ENV",
      },
      {
        title: "LINE Messaging",
        status: lineData.status ?? lineChecks.messaging_api?.status ?? "not_enabled",
        tone: toneFromStatus(lineData.status ?? lineChecks.messaging_api?.status ?? "info"),
        note:
          sendMode.toLowerCase() === "mock"
            ? "Mock send mode (expected ก่อน Soft Launch)"
            : `Send mode: ${sendMode}`,
      },
      {
        title: "Customer binding",
        status: "pending",
        tone: "warning" as BadgeTone,
        note: "Flow รอ LINE Login/LIFF • Manual binding ใช้ได้เฉพาะ testing flag",
      },
      {
        title: "LIFF / Login",
        status: liffStatus === "not_enabled" ? "deferred" : liffStatus,
        tone: liffStatus === "not_enabled" ? "info" : toneFromStatus(liffStatus),
        note: "เลื่อน Phase นี้ ไม่ถือเป็นความผิดพลาด",
      },
      {
        title: "Storage",
        status: health.storage.status,
        tone: toneFromStatus(health.storage.status),
        note: storageBucketSummary,
      },
    ];
  }, [health]);

  const detailCards: CardItem[] = useMemo(() => {
    if (!health) return [];

    const envData = (health.environment.data as any) ?? {};
    const env = envData?.environment ?? envData;
    const envDetails = envData?.details;
    const envMatrix: Array<{ key: string; status: string; required?: boolean }> = envDetails?.matrix ?? [];
    const appEnvDetail = envDetails?.app_env;

    const db = (health.database.data as any)?.database;
    const auth = (health.auth.data as any)?.auth;
    const lineData = (health.lineReady.data as any) ?? {};
    const lineChecks = lineData.checks as Record<string, any> | undefined;

    const storage = (health.storage.data as any)?.storage;

    return [
      {
        title: "Backend",
        icon: Server,
        status: health.backend.status,
        tone: toneFromStatus(health.backend.status),
        body: (
          <div className="space-y-2 text-sm">
            <StatusRow label="API" value={health.backend.status} tone={toneFromStatus(health.backend.status)} />
            <p className="text-xs text-muted-foreground">{health.baseUrl}</p>
          </div>
        ),
      },
      {
        title: "Environment",
        icon: PlugZap,
        status: health.environment.status,
        tone: toneFromStatus(health.environment.status),
        body: (
          <div className="space-y-3 text-sm">
            {appEnvDetail ? (
              <div className="rounded-lg border border-border/70 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">APP_ENV</span>
                  <StatusBadge
                    label={`${appEnvDetail.value}`}
                    tone={toneFromStatus(appEnvDetail.status)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Local: {appEnvDetail.recommended?.local ?? "development"} • Railway: {appEnvDetail.recommended?.railway ?? "production"}
                </p>
              </div>
            ) : null}
            {envMatrix.length ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {envMatrix.map((item) => (
                  <StatusRow key={item.key} label={item.key} value={item.status} tone={toneFromStatus(item.status)} />
                ))}
              </div>
            ) : env ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(env).map(([key, val]) => (
                  <StatusRow key={key} label={key} value={String(val)} tone={toneFromStatus(String(val))} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">ไม่พบข้อมูล environment</p>
            )}
          </div>
        ),
      },
      {
        title: "Auth",
        icon: ShieldCheck,
        status: health.auth.status,
        tone: toneFromStatus(health.auth.status),
        body: auth ? (
          <div className="space-y-1 text-sm">
            <StatusRow label="Provider" value="supabase" tone={toneFromStatus(health.auth.status)} />
            <StatusRow
              label="Configured"
              value={(auth.configured ?? false) ? "yes" : "no"}
              tone={toneFromStatus((auth.configured ?? false) ? "ok" : "partial")}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่พบข้อมูลการตั้งค่า auth</p>
        ),
      },
      {
        title: "Database",
        icon: Database,
        status: health.database.status,
        tone: toneFromStatus(health.database.status),
        body: db ? (
          <div className="space-y-2 text-sm">
            <StatusRow label="Client" value={db.client ?? "-"} tone={toneFromStatus(db.client ?? "partial")}/>
            <StatusRow label="Connection" value={db.connection ?? "not_checked"} tone={toneFromStatus(db.connection ?? "partial")}/>
            <div className="text-xs text-muted-foreground space-y-1">
              {db.checked_table ? <p>checked_table: {db.checked_table}</p> : null}
              {db.reason ? <p>reason: {db.reason}</p> : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่พบข้อมูลฐานข้อมูล</p>
        ),
      },
      {
        title: "LINE Readiness",
        icon: AlertTriangle,
        status: health.lineReady.status,
        tone: toneFromStatus(health.lineReady.status),
        body: lineChecks ? (
          <div className="space-y-3 text-sm">
            {["send_mode", "messaging_api", "webhook", "rich_menu", "liff"].map((key) => {
              const check = lineChecks[key];
              if (!check) return null;
              const labelMap: Record<string, string> = {
                send_mode: "Send Mode",
                messaging_api: "Messaging API",
                webhook: "Webhook",
                rich_menu: "Rich Menu",
                liff: "LIFF",
              };
              return (
                <div key={key} className="rounded-lg border border-border/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{labelMap[key] ?? key}</span>
                    <StatusBadge
                      label={check.mode ? `${check.mode}` : check.status}
                      tone={toneFromStatus(check.status)}
                    />
                  </div>
                  {check.notes ? <p className="text-xs text-muted-foreground">{check.notes}</p> : null}
                  {check.variables ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(check.variables).map(([subKey, val]) => (
                        <StatusRow key={subKey} label={subKey} value={String(val)} tone={toneFromStatus(String(val))} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="text-xs text-muted-foreground">
              real_send_enabled: {String(lineData.real_send_enabled ?? false)}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ยังไม่ตั้งค่า LINE</p>
        ),
      },
      {
        id: "storage",
        title: "Storage",
        icon: HardDrive,
        status: health.storage.status,
        tone: toneFromStatus(health.storage.status),
        body: storage ? (
          <div className="space-y-3 text-sm">
            <StatusRow
              label="Supabase client"
              value={storage.supabase_configured ? "configured" : "missing"}
              tone={toneFromStatus(storage.supabase_configured ? "ok" : "warning")}
            />
            <div className="space-y-2">
              {(storage.buckets ?? []).map((bucket: any) => (
                <div key={bucket.key} className="rounded-lg border border-border/70 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{bucket.label}</p>
                      <p className="text-xs text-muted-foreground">mode: {bucket.mode}</p>
                    </div>
                    <StatusBadge label={bucket.status} tone={toneFromStatus(bucket.status)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <StatusRow label="bucket" value={bucket.bucket || "missing"} tone={toneFromStatus(bucket.bucket ? "ok" : "warning")} />
                    <StatusRow label="probe" value={bucket.probe} tone={toneFromStatus(bucket.probe)} />
                  </div>
                  {bucket.reason ? (
                    <p className="text-xs text-muted-foreground">reason: {bucket.reason}</p>
                  ) : null}
                </div>
              ))}
            </div>
            {storage.notes?.length ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {storage.notes.map((note: string) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่พบข้อมูล storage health</p>
        ),
      },
    ];
  }, [health]);

  return (
    <SystemLayout
      title="ตรวจสอบระบบ"
      subtitle="สถานะระบบพื้นฐาน, Storage และการเชื่อมต่อภายนอก"
    >
      {loading ? <LoadingState label="กำลังโหลดสถานะระบบ..." /> : null}
      {!loading && !health ? (
        <div className="stat-card space-y-2">
          <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
            <WifiOff className="w-4 h-4" />
            <span>ไม่สามารถดึงข้อมูลสถานะได้</span>
          </div>
          <p className="text-sm text-muted-foreground">ตรวจสอบการเชื่อมต่อ backend แล้วลองใหม่</p>
        </div>
      ) : null}

      {summaryCards.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {summaryCards.map((card) => (
            <section key={card.title} className="stat-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <h2 className="section-title mb-0">{card.title}</h2>
                </div>
                <StatusBadge label={card.status} tone={card.tone} />
              </div>
              <p className="text-sm text-muted-foreground">{card.note}</p>
            </section>
          ))}
        </div>
      ) : null}

      <section className="stat-card space-y-4 mt-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title mb-0">รายละเอียดขั้นสูง</h2>
          <p className="text-xs text-muted-foreground">คลิกเพื่อดู matrix / ตัวแปรรายจุด</p>
        </div>
        <div className="space-y-3">
          {detailCards.map((card) => (
            <details key={card.title} id={card.id} className="rounded-xl border border-border/60 p-3">
              <summary className="flex items-center justify-between gap-2 cursor-pointer">
                <div className="flex items-center gap-2">
                  <card.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{card.title}</span>
                </div>
                <StatusBadge label={card.status} tone={card.tone} />
              </summary>
              <div className="mt-3 text-sm space-y-2">
                {card.title === "LINE Readiness" ? (
                  <p className="text-xs text-muted-foreground">
                    Send mode mock = คาดหวังสำหรับ QA • LIFF = Deferred/Not required ในระยะนี้ • Customer binding = pending flow
                  </p>
                ) : null}
                {card.body}
              </div>
            </details>
          ))}
        </div>
      </section>
    </SystemLayout>
  );
}

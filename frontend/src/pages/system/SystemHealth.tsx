import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, HardDrive, PlugZap, Server, ShieldAlert, ShieldCheck, WifiOff } from "lucide-react";
import SystemLayout from "@/components/system/SystemLayout";
import StatusBadge, { type BadgeTone } from "@/components/shared/StatusBadge";
import LoadingState from "@/components/shared/LoadingState";
import { loadBackendHealth, type HealthSummary } from "@/services/systemConsoleService";

type CardItem = {
  title: string;
  icon: React.ElementType;
  status: string;
  tone: BadgeTone;
  body: React.ReactNode;
};

function toneFromStatus(status: string): BadgeTone {
  const normalized = (status || "").toLowerCase();
  if (normalized === "ok") return "success";
  if (normalized === "partial" || normalized === "not_configured") return "warning";
  if (normalized === "unavailable" || normalized === "error") return "danger";
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

  const cards: CardItem[] = useMemo(() => {
    if (!health) return [];

    const env = (health.environment.data as any)?.environment;
    const db = (health.database.data as any)?.database;
    const auth = (health.auth.data as any)?.auth;
    const line = (health.lineReady.data as any)?.line;

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
        body: env ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(env).map(([key, val]) => (
              <StatusRow key={key} label={key} value={String(val)} tone={toneFromStatus(String(val) === "configured" ? "ok" : "partial")} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่พบข้อมูล environment</p>
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
        body: line ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(line).map(([key, val]) => (
              <StatusRow key={key} label={key} value={String(val)} tone={toneFromStatus(String(val) === "configured" ? "ok" : "partial")} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ยังไม่ตั้งค่า LINE</p>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <section key={card.title} className="stat-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <card.icon className="w-4 h-4 text-muted-foreground" />
                <h2 className="section-title mb-0">{card.title}</h2>
              </div>
              <StatusBadge label={card.status} tone={card.tone} />
            </div>
            {card.body}
          </section>
        ))}
      </div>

      <section id="storage" className="stat-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <h2 className="section-title mb-0">Storage Check</h2>
          </div>
          <StatusBadge label="planned" tone="info" />
        </div>
        <p className="text-sm text-muted-foreground">ตรวจสุขภาพ storage แบบอ่านอย่างเดียว (ยังไม่ลบไฟล์จริง)</p>
        <ul className="text-sm space-y-1">
          <li className="flex items-center gap-2 text-muted-foreground"><ShieldAlert className="w-4 h-4" /> ตรวจ bucket: เมนู (images)</li>
          <li className="flex items-center gap-2 text-muted-foreground"><ShieldAlert className="w-4 h-4" /> ตรวจ bucket: สลิปชำระเงิน</li>
          <li className="flex items-center gap-2 text-muted-foreground"><ShieldAlert className="w-4 h-4" /> ตรวจ bucket: สินทรัพย์ร้านค้า</li>
          <li className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="w-4 h-4" /> รายงาน orphan files (ยังไม่ลบอัตโนมัติ)</li>
        </ul>
      </section>
    </SystemLayout>
  );
}

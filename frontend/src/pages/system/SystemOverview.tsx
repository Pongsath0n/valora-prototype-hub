import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SystemLayout from "@/components/system/SystemLayout";
import { Activity, AlertTriangle, Database, FileText, ShieldCheck, ShieldCheck as ShieldBadge, Users } from "lucide-react";
import { DEMO_RESET_CONFIRMATION_PHRASE, isDemoResetAvailable, resetDemoData, type DemoResetReport } from "@/services/demoReset";

const systemCards = [
  {
    title: "จัดการผู้ใช้",
    desc: "เพิ่ม/ปิดการใช้งานบัญชี รีเซ็ตสิทธิ์ และเชื่อมโยงบัญชีกับร้าน",
    icon: Users,
    to: "/system/users",
  },
  {
    title: "จัดการสิทธิ์",
    desc: "กำหนด role เช่น owner/admin/manager/staff และสิทธิ์การเข้าถึงระบบ",
    icon: ShieldCheck,
    to: "/system/roles",
  },
  {
    title: "ตรวจสอบระบบ",
    desc: "ดูสถานะระบบพื้นฐาน รวมถึง Storage Check",
    icon: Activity,
    to: "/system/health",
  },
  {
    title: "บันทึกเหตุการณ์",
    desc: "Audit logs ของการกระทำที่สำคัญในระบบ",
    icon: FileText,
    to: "/system/audit-logs",
  },
  {
    title: "Storage Check",
    desc: "ตรวจสอบ Storage และ Asset ที่ระบบใช้งาน",
    icon: Database,
    to: "/system/health",
  },
];

export default function SystemOverviewPage() {
  const demoResetEnabled = useMemo(() => isDemoResetAvailable(), []);
  const [confirmationText, setConfirmationText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [result, setResult] = useState<DemoResetReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typedCorrectly = confirmationText.trim() === DEMO_RESET_CONFIRMATION_PHRASE;
  const canTriggerReset = demoResetEnabled && typedCorrectly && !isResetting;

  function handleReset() {
    if (!demoResetEnabled) return;
    setIsResetting(true);
    setError(null);
    try {
      const report = resetDemoData();
      setResult(report);
      setConfirmationText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถรีเซ็ตข้อมูลได้");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <SystemLayout>
      <section className="stat-card">
        <h2 className="section-title mb-2">Internal System Console</h2>
        <p className="text-sm text-muted-foreground">
          พื้นที่สำหรับดูแลระบบกลาง ไม่เกี่ยวกับการขายหน้าร้าน หากต้องการจัดการออเดอร์หรือเมนู
          ให้ไปที่{" "}
          <Link to="/owner/dashboard" className="underline">
            แดชบอร์ดธุรกิจ
          </Link>
          .
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {systemCards.map((item) => (
          <Link
            key={item.title}
            to={item.to}
            className="stat-card hover:border-accent/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-accent" />
              </div>
              <h2 className="font-semibold text-foreground">{item.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
          </Link>
        ))}
      </div>

      <section className="stat-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-warning">Testing-only control</p>
            <h2 className="section-title mt-1">รีเซ็ตข้อมูลทดสอบ (Local Prototype)</h2>
            <p className="text-sm text-muted-foreground">
              ล้างข้อมูลที่เก็บไว้ใน localStorage ภายใต้คำนำหน้า <code>valora:</code> ทั้งหมดและคืนค่าดีฟอลต์ของ mock data.
              ฟีเจอร์นี้ไม่แตะ Supabase หรือฐานข้อมูลจริง
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${demoResetEnabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
            Flag {demoResetEnabled ? "ON" : "OFF"}
          </div>
        </div>

        <ul className="text-sm text-muted-foreground space-y-1 bg-muted/40 rounded-lg p-3">
          <li className="flex items-start gap-2"><ShieldBadge className="w-4 h-4 mt-0.5 text-muted-foreground" />Owner เท่านั้น (เข้าผ่าน System Console)</li>
          <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500" />ต้องตั้งค่า <code>VITE_ALLOW_DEMO_DATA_RESET=true</code> และ build ที่ไม่ใช่ production</li>
          <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500" />ต้องพิมพ์ข้อความยืนยัน "{DEMO_RESET_CONFIRMATION_PHRASE}" เพื่อดำเนินการ</li>
          <li className="flex items-start gap-2"><ShieldBadge className="w-4 h-4 mt-0.5 text-muted-foreground" />ใช้สำหรับทดสอบ / E2E เท่านั้น ห้ามเปิดใช้บน production</li>
        </ul>

        {demoResetEnabled ? (
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground block">
              พิมพ์เพื่อยืนยัน
              <span className="block text-xs text-muted-foreground">{DEMO_RESET_CONFIRMATION_PHRASE}</span>
            </label>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={DEMO_RESET_CONFIRMATION_PHRASE}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={handleReset}
              disabled={!canTriggerReset}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed bg-primary hover:opacity-90"
            >
              {isResetting ? "กำลังรีเซ็ต..." : "รีเซ็ตข้อมูลทดสอบ"}
            </button>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {result ? (
              <div className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
                ล้าง {result.clearedKeys.length} รายการเมื่อ {new Date(result.timestamp).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                {result.clearedKeys.length > 0 ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer select-none">ดูคีย์ที่ถูกล้าง</summary>
                    <div className="mt-1 font-mono text-[11px] leading-4 max-h-32 overflow-y-auto">
                      {result.clearedKeys.sort().map((key) => (
                        <div key={key}>{key}</div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 text-sm text-muted-foreground">
            ฟีเจอร์นี้ถูกปิดไว้ เรียนทีมทดสอบตั้งค่า <code>VITE_ALLOW_DEMO_DATA_RESET=true</code> ในไฟล์ .env (เฉพาะ environment สำหรับ QA/E2E เท่านั้น)
          </div>
        )}
      </section>
    </SystemLayout>
  );
}

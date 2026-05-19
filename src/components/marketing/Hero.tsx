import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, LayoutDashboard, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const trustPoints = [
  "เริ่มใช้ได้ทันที ไม่ต้องลงโปรแกรม",
  "เห็นต้นทุน–กำไรต่อเมนูจริง",
  "รองรับลูกค้าสั่งผ่าน LINE OA",
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Subtle gradient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, hsl(var(--accent) / 0.18) 0%, transparent 60%), radial-gradient(50% 50% at 100% 10%, hsl(var(--primary) / 0.08) 0%, transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            POS + Profit Control + LINE OA Order Engine
          </div>

          <h1
            className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl"
            style={{ lineHeight: 1.25 }}
          >
            จัดการออเดอร์ <span className="text-accent">เห็นกำไรจริง</span>
            <br className="hidden sm:block" /> เชื่อม LINE OA ได้ในระบบเดียว
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            Valora ช่วยร้านเล็กจัดการออเดอร์ ตรวจสลิป และดูต้นทุน–กำไรต่อเมนูได้ง่ายขึ้น
            ออกแบบมาให้เจ้าของร้านใช้คนเดียวก็ไหว
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/client-access" className="inline-flex items-center gap-2">
                ลองใช้งานระบบ
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link to="/admin" className="inline-flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                ดูตัวอย่าง Dashboard
              </Link>
            </Button>
          </div>

          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {trustPoints.map((t) => (
              <li key={t} className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Mock dashboard preview card */}
        <div className="relative mt-14 md:mt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 -top-6 h-24 rounded-full bg-accent/20 blur-3xl"
          />
          <div className="relative mx-auto max-w-5xl rounded-2xl border bg-card p-3 shadow-xl md:p-4">
            <div className="rounded-xl border bg-background p-5 md:p-8">
              <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-success/70" />
                  <span className="ml-3 text-xs text-muted-foreground">valora.app/admin</span>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  วันนี้ • อัปเดตล่าสุด 09:42
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                  { label: "ยอดขายวันนี้", value: "฿ 8,420", change: "+12%" },
                  { label: "ออเดอร์ที่รอตรวจสลิป", value: "3", change: "ใหม่" },
                  { label: "กำไรขั้นต้น", value: "฿ 4,210", change: "50.0%" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{m.value}</p>
                    <p className="mt-1 text-xs font-medium text-success">{m.change}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-5">
                <div className="rounded-xl border bg-card p-4 md:col-span-3">
                  <p className="text-sm font-semibold text-foreground">ออเดอร์ล่าสุด</p>
                  <div className="mt-3 space-y-2">
                    {[
                      { id: "#1042", item: "ลาเต้เย็น × 2", status: "รอตรวจสลิป", tone: "warning" },
                      { id: "#1041", item: "อเมริกาโน่ × 1", status: "กำลังเตรียม", tone: "info" },
                      { id: "#1040", item: "มัทฉะลาเต้ × 3", status: "พร้อมรับ", tone: "success" },
                    ].map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium tabular-nums text-foreground">{row.id}</span>
                          <span className="text-muted-foreground">{row.item}</span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.tone === "warning"
                              ? "bg-warning/15 text-warning-foreground"
                              : row.tone === "info"
                                ? "bg-info/15 text-info"
                                : "bg-success/15 text-success"
                          }`}
                          style={
                            row.tone === "warning"
                              ? { color: "hsl(var(--warning-foreground))", backgroundColor: "hsl(var(--warning) / 0.15)" }
                              : row.tone === "info"
                                ? { color: "hsl(var(--info))", backgroundColor: "hsl(var(--info) / 0.15)" }
                                : { color: "hsl(var(--success))", backgroundColor: "hsl(var(--success) / 0.15)" }
                          }
                        >
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-4 md:col-span-2">
                  <p className="text-sm font-semibold text-foreground">ลูกค้าทักผ่าน LINE OA</p>
                  <div className="mt-3 space-y-2">
                    {[
                      { name: "คุณก้อง", msg: "ขออเมริกาโน่ 2 แก้วครับ" },
                      { name: "คุณเอ", msg: "สั่งล่วงหน้าได้มั้ยคะ" },
                    ].map((c) => (
                      <div key={c.name} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          <p className="text-muted-foreground">{c.msg}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

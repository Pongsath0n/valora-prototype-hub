import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Questions Valora helps a small-shop owner answer (the core value framing). */
const coreQuestions = [
  "ขายแก้วนี้แล้วเหลือกำไรจริงเท่าไหร่?",
  "ต้องขายกี่แก้วต่อวันถึงคุ้มทุน?",
  "ค่าเช่า ค่าน้ำ ค่าไฟ ทำให้กำไรหายไปแค่ไหน?",
  "เมนูไหนควรขายต่อ เมนูไหนควรระวัง?",
];

/** Illustrative demo figures only — clearly labelled, not real shop data. */
const demoOverhead = [
  { label: "ค่าเช่า / เดือน", value: "฿ 5,500" },
  { label: "ค่าไฟ / เดือน", value: "฿ 1,300" },
  { label: "ต้นทุนแฝงต่อแก้ว", value: "฿ 22.67" },
];

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="landing-hero-heading">
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
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
            Profit Planning สำหรับร้านกาแฟและ SMEs ขนาดเล็ก
          </p>

          <h1
            id="landing-hero-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl"
            style={{ lineHeight: 1.3 }}
          >
            เห็นกำไรจริงของร้าน
            <br className="hidden sm:block" /> <span className="text-accent">ก่อนตัดสินใจขาย</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            Valora ช่วยเจ้าของร้านกาแฟและ SMEs ขนาดเล็กคำนวณต้นทุน วางแผนกำไร จุดคุ้มทุน
            และต้นทุนแฝง เช่น ค่าเช่า ค่าน้ำ ค่าไฟ ในที่เดียว
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/login" className="inline-flex items-center gap-2" aria-label="เข้าสู่ระบบ">
                เข้าสู่ระบบ
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a
                href="#preview"
                className="inline-flex items-center gap-2"
                aria-label="ดูระบบวางแผนกำไร"
              >
                ดูระบบวางแผนกำไร
              </a>
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
            <a
              href="#planning"
              className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ดูวิธีคิดกำไรและจุดคุ้มทุน
            </a>
          </div>

          <ul className="mx-auto mt-9 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
            {coreQuestions.map((q) => (
              <li
                key={q}
                className="inline-flex items-start gap-2 rounded-xl border bg-card/60 px-3 py-2 text-sm text-foreground/90"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden />
                {q}
              </li>
            ))}
          </ul>
        </div>

        <figure
          className="relative mt-14 md:mt-20"
          aria-label="ตัวอย่างการวางแผนกำไรและจุดคุ้มทุนของ Valora (ข้อมูลจำลอง)"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 -top-6 h-24 rounded-full bg-accent/20 blur-3xl"
          />
          <div className="relative mx-auto max-w-3xl rounded-2xl border bg-card p-3 shadow-xl md:p-4">
            <span className="absolute right-5 top-5 z-10 rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
              ภาพจำลอง • ข้อมูลตัวอย่าง
            </span>
            <div className="rounded-xl border bg-background p-5 md:p-8">
              <div className="flex items-center gap-3 border-b pb-4">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"
                  aria-hidden
                >
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">วางแผนกำไรร้านกาแฟ</p>
                  <p className="text-xs text-muted-foreground">ตัวอย่างการคำนวณต้นทุนแฝงและจุดคุ้มทุน</p>
                </div>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                {demoOverhead.map((m) => (
                  <div key={m.label} className="rounded-xl border bg-card p-4">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </dt>
                    <dd className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-col items-start justify-between gap-2 rounded-xl border border-success/30 bg-success/10 p-5 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    จุดคุ้มทุน
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                    ≈ 180 แก้ว / เดือน
                    <span className="ml-2 text-sm font-medium text-muted-foreground">
                      (≈ 6 แก้ว / วัน)
                    </span>
                  </p>
                </div>
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  ต้องขายให้ถึงจุดนี้ก่อน ร้านถึงจะเริ่มมีกำไรจริงหลังหักต้นทุนแฝง
                </p>
              </div>
            </div>
          </div>
          <figcaption className="sr-only">
            ภาพประกอบการวางแผนกำไรของ Valora แสดงต้นทุนแฝงตัวอย่าง เช่น ค่าเช่า ค่าไฟ
            ต้นทุนแฝงต่อแก้ว และจุดคุ้มทุนต่อเดือน/ต่อวัน (เป็นข้อมูลจำลองเพื่อสาธิตเท่านั้น)
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

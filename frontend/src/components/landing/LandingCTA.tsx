import { Link } from "react-router-dom";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingCTA() {
  return (
    <section className="border-t py-20 md:py-24" aria-labelledby="landing-cta-heading">
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-3xl border bg-primary p-8 text-primary-foreground md:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 80% at 0% 0%, hsl(var(--accent) / 0.25) 0%, transparent 60%), radial-gradient(60% 80% at 100% 100%, hsl(var(--accent) / 0.15) 0%, transparent 60%)",
            }}
          />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2
              id="landing-cta-heading"
              className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
            >
              เริ่มเห็นกำไรจริงของร้านคุณ
            </h2>
            <p className="mt-4 text-base text-primary-foreground/80 md:text-lg">
              ลองเปิด Valora แล้ววางแผนกำไร คำนวณต้นทุนแฝง และดูจุดคุ้มทุนของร้าน
              ไม่มีข้อผูกมัด ไม่ต้องลงโปรแกรมเพิ่ม
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2"
                  aria-label="เข้าสู่ระบบ"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden />
                  เข้าสู่ระบบ
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
              >
                <a
                  href="#planning"
                  className="inline-flex items-center gap-2"
                  aria-label="ดูวิธีคิดกำไรและจุดคุ้มทุน"
                >
                  ดูวิธีคิดกำไรและจุดคุ้มทุน
                </a>
              </Button>
            </div>

            <p className="mt-6 text-xs text-primary-foreground/60">
              ต้องการให้ทีม Valora ช่วยติดตั้งกับร้านของคุณ? ติดต่อเราด้านล่างได้เลย
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

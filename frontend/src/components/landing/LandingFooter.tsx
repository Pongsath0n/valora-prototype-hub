import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

const productLinks = [
  { href: "#pain", label: "ปัญหา" },
  { href: "#solution", label: "วิธีแก้" },
  { href: "#profit", label: "กำไรต่อเมนู" },
  { href: "#workflow", label: "Workflow" },
  { href: "#transparency", label: "ความโปร่งใส" },
];

export default function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-muted/30" aria-labelledby="landing-footer-heading">
      <h2 id="landing-footer-heading" className="sr-only">
        ส่วนท้ายของหน้า
      </h2>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <LogoBrand size="sm" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              ระบบสั่งซื้อและวางแผนกำไรสำหรับร้านกาแฟและ SME ขนาดเล็ก
              ที่ช่วยให้เจ้าของร้านเห็นต้นทุนและกำไรจริง โดยไม่ต้องเริ่มจากระบบ POS ขนาดใหญ่
            </p>
          </div>

          <nav aria-label="ลิงก์ผลิตภัณฑ์">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ผลิตภัณฑ์
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {productLinks.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/client-access"
                  className="text-foreground/80 transition-colors hover:text-foreground"
                >
                  เข้าสู่ระบบ
                </Link>
              </li>
              <li>
                <a
                  href="#snapshots"
                  className="text-foreground/80 transition-colors hover:text-foreground"
                >
                  ดูตัวอย่างหน้าจอระบบ
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ติดต่อ
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2 text-foreground/80">
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                <a
                  href="mailto:pongsathon.officialwork@gmail.com"
                  className="transition-colors hover:text-foreground"
                >
                  pongsathon.officialwork@gmail.com
                </a>
              </li>
              <li className="text-sm text-muted-foreground">
                สำหรับการขอ demo หรือสอบถามการติดตั้งกับร้านของคุณ
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {year} Valora. All rights reserved.</p>
          <p>Made for small shops in Thailand.</p>
        </div>
      </div>
    </footer>
  );
}

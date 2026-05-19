import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

const productLinks = [
  { href: "#features", label: "ฟีเจอร์" },
  { href: "#workflow", label: "ขั้นตอนใช้งาน" },
  { href: "#use-cases", label: "เหมาะกับใคร" },
  { href: "#transparency", label: "ความโปร่งใส Phase 1" },
];

export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <LogoBrand size="sm" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              POS + Profit Control + LINE OA Order Engine สำหรับร้านเล็ก
              ที่อยากเห็นกำไรจริงและจัดการออเดอร์ได้ในระบบเดียว
            </p>
          </div>

          <div>
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
                <Link
                  to="/admin"
                  className="text-foreground/80 transition-colors hover:text-foreground"
                >
                  ดู Admin Demo
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ติดต่อ
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2 text-foreground/80">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a
                  href="mailto:pongsathon.po@kkumail.com"
                  className="transition-colors hover:text-foreground"
                >
                  pongsathon.po@kkumail.com
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

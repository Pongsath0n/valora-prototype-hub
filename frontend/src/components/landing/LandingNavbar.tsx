import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import LogoBrand from "@/components/LogoBrand";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "#pain", label: "ปัญหา" },
  { href: "#solution", label: "วิธีแก้" },
  { href: "#profit", label: "กำไรต่อเมนู" },
  { href: "#workflow", label: "Workflow" },
  { href: "#transparency", label: "ความโปร่งใส" },
];

export default function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b transition-colors ${
        scrolled
          ? "border-border bg-background/85 backdrop-blur-md"
          : "border-transparent bg-background/60 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:py-4">
        <Link to="/" className="flex items-center" aria-label="Valora — กลับหน้าแรก">
          <LogoBrand size="sm" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="เมนูหลัก">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/client-access" aria-label="เข้าสู่ระบบร้านค้า">
              เข้าสู่ระบบร้านค้า
            </Link>
          </Button>
          <Button asChild size="sm">
            <a href="#workflow" aria-label="ดู Workflow ของระบบ">
              ดู Workflow ของระบบ
            </a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground md:hidden"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {open && (
        <div id="landing-mobile-menu" className="border-t bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="เมนูมือถือ">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm" onClick={() => setOpen(false)}>
                <Link to="/client-access" aria-label="เข้าสู่ระบบร้านค้า">
                  เข้าสู่ระบบร้านค้า
                </Link>
              </Button>
              <Button asChild size="sm" onClick={() => setOpen(false)}>
                <a href="#workflow" aria-label="ดู Workflow ของระบบ">
                  ดู Workflow ของระบบ
                </a>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

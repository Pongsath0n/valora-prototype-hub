import { Layers, Target } from "lucide-react";

/** All figures below are illustrative demo data — clearly labelled, not real shop data. */
const overheadRows = [
  { label: "ค่าเช่า", value: "฿ 5,500" },
  { label: "ค่าไฟ", value: "฿ 1,300" },
  { label: "ค่าน้ำ", value: "฿ 400" },
  { label: "ค่าใช้จ่ายประจำอื่น ๆ", value: "฿ 600" },
];

const menuRows = [
  { name: "อเมริกาโน่เย็น", price: "฿ 55", profit: "฿ 28", margin: 51, tone: "success" as const },
  { name: "ลาเต้เย็น", price: "฿ 65", profit: "฿ 20", margin: 31, tone: "info" as const },
  { name: "มัทฉะลาเต้", price: "฿ 75", profit: "฿ 15", margin: 20, tone: "warning" as const },
];

function barColor(tone: "success" | "info" | "warning"): string {
  if (tone === "success") return "hsl(var(--success))";
  if (tone === "info") return "hsl(var(--info))";
  return "hsl(var(--warning))";
}

export default function ProductSnapshots() {
  return (
    <section
      id="preview"
      className="border-t bg-muted/30 py-20 md:py-24"
      aria-labelledby="preview-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            ตัวอย่างระบบ • ข้อมูลจำลอง
          </p>
          <h2
            id="preview-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            หน้าตาการวางแผนกำไรใน Valora
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ตัวอย่างการมองเห็นต้นทุนแฝงและกำไรต่อเมนู ตัวเลขทั้งหมดเป็นข้อมูลจำลองเพื่อสาธิตเท่านั้น
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b pb-4">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"
                aria-hidden
              >
                <Layers className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">ต้นทุนแฝงต่อเดือน</p>
                <p className="text-xs text-muted-foreground">ค่าใช้จ่ายประจำที่มักถูกลืม</p>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {overheadRows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium tabular-nums text-foreground">{r.value}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
              <span className="text-sm font-medium text-foreground">ต้นทุนแฝงต่อแก้ว</span>
              <span className="text-lg font-bold tabular-nums text-foreground">≈ ฿ 22.67</span>
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b pb-4">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"
                aria-hidden
              >
                <Target className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">กำไรต่อเมนู</p>
                <p className="text-xs text-muted-foreground">เมนูไหนทำกำไรจริง เมนูไหนควรระวัง</p>
              </div>
            </div>

            <ul className="mt-4 space-y-3">
              {menuRows.map((m) => (
                <li key={m.name} className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{m.name}</span>
                    <span className="text-muted-foreground">
                      ราคา {m.price} ·{" "}
                      <span className="font-semibold text-foreground">กำไร {m.profit}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
                      role="img"
                      aria-label={`อัตรากำไร ${m.margin}%`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${m.margin}%`, backgroundColor: barColor(m.tone) }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-medium tabular-nums text-muted-foreground">
                      {m.margin}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-6 flex max-w-3xl flex-col items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-6 py-5 text-center sm:flex-row sm:gap-4">
          <span className="text-sm font-medium text-muted-foreground">จุดคุ้มทุนจากตัวอย่างนี้</span>
          <span className="text-xl font-bold tabular-nums text-foreground">
            ≈ 180 แก้ว / เดือน
            <span className="ml-2 text-sm font-medium text-muted-foreground">(≈ 6 แก้ว / วัน)</span>
          </span>
        </div>
      </div>
    </section>
  );
}

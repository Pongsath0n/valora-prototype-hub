import { BarChart3, TrendingUp, DollarSign, Target, Utensils, Percent } from "lucide-react";

type MockupType = "dashboard" | "costing" | "scenario" | "breakeven";

const mockupStyles = {
  wrapper: {
    background: "hsl(220, 20%, 97%)",
    borderRadius: "1rem",
    padding: "1.25rem",
    fontFamily: "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif",
    fontSize: "0.75rem",
    color: "hsl(222, 47%, 11%)",
    minHeight: "280px",
  } as React.CSSProperties,
  kpiCard: {
    background: "white",
    borderRadius: "0.75rem",
    padding: "0.75rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  label: {
    fontSize: "0.625rem",
    color: "hsl(220, 9%, 46%)",
    lineHeight: 1.6,
    marginBottom: "0.25rem",
  } as React.CSSProperties,
  value: {
    fontSize: "1.1rem",
    fontWeight: 700,
    lineHeight: 1.3,
    color: "hsl(222, 47%, 11%)",
  } as React.CSSProperties,
  bar: (h: number, color: string) =>
    ({
      width: "100%",
      height: `${h}px`,
      background: color,
      borderRadius: "4px 4px 0 0",
    }) as React.CSSProperties,
};

function DashboardMockup() {
  const kpis = [
    { label: "ยอดขายวันนี้", value: "฿12,450", icon: DollarSign, color: "hsl(38, 92%, 50%)" },
    { label: "จุดคุ้มทุน", value: "45 แก้ว", icon: Target, color: "hsl(152, 60%, 40%)" },
    { label: "กำไรขั้นต้น", value: "62%", icon: TrendingUp, color: "hsl(210, 92%, 45%)" },
  ];
  const bars = [65, 80, 45, 90, 70, 55, 85];
  const days = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

  return (
    <div style={mockupStyles.wrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <BarChart3 style={{ width: 16, height: 16, color: "hsl(38, 92%, 50%)" }} />
        <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>Dashboard — ภาพรวมร้าน</span>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {kpis.map((k) => (
          <div key={k.label} style={mockupStyles.kpiCard}>
            <div style={{ ...mockupStyles.label, display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <k.icon style={{ width: 10, height: 10, color: k.color }} />
              {k.label}
            </div>
            <div style={{ ...mockupStyles.value, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ ...mockupStyles.kpiCard, padding: "0.75rem" }}>
        <div style={mockupStyles.label}>ยอดขายรายสัปดาห์</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "80px", marginTop: "0.5rem" }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div style={mockupStyles.bar(h, i === 3 ? "hsl(38, 92%, 50%)" : "hsl(222, 47%, 16%)")} />
              <span style={{ fontSize: "0.5rem", color: "hsl(220, 9%, 46%)" }}>{days[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CostingMockup() {
  const items = [
    { name: "เมล็ดกาแฟ", qty: "18g", cost: "฿12.60" },
    { name: "นม", qty: "200ml", cost: "฿8.00" },
    { name: "น้ำเชื่อม", qty: "30ml", cost: "฿3.50" },
    { name: "แก้ว+ฝา", qty: "1 ชุด", cost: "฿4.00" },
  ];

  return (
    <div style={mockupStyles.wrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <Utensils style={{ width: 16, height: 16, color: "hsl(38, 92%, 50%)" }} />
        <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>ต้นทุนเมนู — ลาเต้เย็น</span>
      </div>
      <div style={{ ...mockupStyles.kpiCard, padding: 0, overflow: "hidden", marginBottom: "0.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "hsl(222, 47%, 16%)", color: "white" }}>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.65rem", fontWeight: 600 }}>วัตถุดิบ</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.65rem", fontWeight: 600 }}>ปริมาณ</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.65rem", fontWeight: 600 }}>ต้นทุน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.name} style={{ background: i % 2 ? "hsl(220, 20%, 97%)" : "white" }}>
                <td style={{ padding: "0.4rem 0.75rem", fontSize: "0.7rem" }}>{it.name}</td>
                <td style={{ padding: "0.4rem 0.75rem", textAlign: "right", fontSize: "0.7rem", color: "hsl(220, 9%, 46%)" }}>{it.qty}</td>
                <td style={{ padding: "0.4rem 0.75rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 600 }}>{it.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ ...mockupStyles.kpiCard, background: "hsl(152, 60%, 95%)" }}>
          <div style={mockupStyles.label}>ราคาขาย</div>
          <div style={{ ...mockupStyles.value, color: "hsl(152, 60%, 40%)" }}>฿75</div>
        </div>
        <div style={mockupStyles.kpiCard}>
          <div style={mockupStyles.label}>ต้นทุนรวม</div>
          <div style={mockupStyles.value}>฿28.10</div>
        </div>
        <div style={{ ...mockupStyles.kpiCard, background: "hsl(38, 92%, 97%)" }}>
          <div style={{ ...mockupStyles.label, display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <Percent style={{ width: 9, height: 9 }} /> GP
          </div>
          <div style={{ ...mockupStyles.value, color: "hsl(38, 92%, 45%)" }}>62.5%</div>
        </div>
      </div>
    </div>
  );
}

function ScenarioMockup() {
  const rows = [
    { label: "จุดคุ้มทุน/เดือน", base: "1,350", scen: "1,180", diff: "-170", good: true },
    { label: "จุดคุ้มทุน/วัน", base: "45", scen: "39", diff: "-6", good: true },
    { label: "กำไรสุทธิ/เดือน", base: "฿18,500", scen: "฿24,200", diff: "+฿5,700", good: true },
  ];

  return (
    <div style={mockupStyles.wrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <TrendingUp style={{ width: 16, height: 16, color: "hsl(38, 92%, 50%)" }} />
        <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>จำลองสถานการณ์ — ปรับราคา +5 บาท</span>
      </div>
      <div style={{ ...mockupStyles.kpiCard, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "hsl(222, 47%, 16%)", color: "white" }}>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.65rem" }}>KPI</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.65rem" }}>ปัจจุบัน</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.65rem" }}>สถานการณ์</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.65rem" }}>ผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} style={{ background: i % 2 ? "hsl(220, 20%, 97%)" : "white" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 500 }}>{r.label}</td>
                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.7rem", color: "hsl(220, 9%, 46%)" }}>{r.base}</td>
                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 600 }}>{r.scen}</td>
                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.7rem", fontWeight: 700, color: r.good ? "hsl(152, 60%, 40%)" : "hsl(0, 72%, 51%)" }}>{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreakevenMockup() {
  return (
    <div style={mockupStyles.wrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <Target style={{ width: 16, height: 16, color: "hsl(38, 92%, 50%)" }} />
        <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>วิเคราะห์จุดคุ้มทุน</span>
      </div>
      {/* Simple SVG chart */}
      <div style={{ ...mockupStyles.kpiCard, padding: "0.75rem", marginBottom: "0.75rem" }}>
        <svg viewBox="0 0 300 120" style={{ width: "100%", height: "auto" }}>
          {/* Grid lines */}
          {[0, 30, 60, 90].map((y) => (
            <line key={y} x1="30" y1={y + 10} x2="290" y2={y + 10} stroke="hsl(220, 13%, 90%)" strokeWidth="0.5" />
          ))}
          {/* Revenue line */}
          <polyline points="30,100 80,82 130,65 180,47 230,30 280,12" fill="none" stroke="hsl(38, 92%, 50%)" strokeWidth="2.5" />
          {/* Cost line */}
          <polyline points="30,95 80,85 130,75 180,65 230,55 280,45" fill="none" stroke="hsl(222, 47%, 16%)" strokeWidth="2" strokeDasharray="6,3" />
          {/* Break-even point */}
          <circle cx="155" cy="56" r="6" fill="hsl(152, 60%, 40%)" />
          <circle cx="155" cy="56" r="3" fill="white" />
          {/* Labels */}
          <text x="158" y="52" fontSize="7" fill="hsl(152, 60%, 40%)" fontWeight="700">จุดคุ้มทุน</text>
          <text x="282" y="16" fontSize="6" fill="hsl(38, 92%, 50%)" fontWeight="600">รายได้</text>
          <text x="282" y="48" fontSize="6" fill="hsl(222, 47%, 16%)" fontWeight="600">ต้นทุน</text>
        </svg>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ ...mockupStyles.kpiCard, background: "hsl(152, 60%, 95%)" }}>
          <div style={mockupStyles.label}>จุดคุ้มทุน</div>
          <div style={{ ...mockupStyles.value, color: "hsl(152, 60%, 40%)" }}>45 แก้ว/วัน</div>
        </div>
        <div style={mockupStyles.kpiCard}>
          <div style={mockupStyles.label}>เป้ากำไร</div>
          <div style={mockupStyles.value}>62 แก้ว/วัน</div>
        </div>
        <div style={{ ...mockupStyles.kpiCard, background: "hsl(38, 92%, 97%)" }}>
          <div style={mockupStyles.label}>Safety Margin</div>
          <div style={{ ...mockupStyles.value, color: "hsl(38, 92%, 45%)" }}>27.4%</div>
        </div>
      </div>
    </div>
  );
}

const mockupMap: Record<MockupType, () => JSX.Element> = {
  dashboard: DashboardMockup,
  costing: CostingMockup,
  scenario: ScenarioMockup,
  breakeven: BreakevenMockup,
};

export default function FeatureMockup({ type }: { type: MockupType }) {
  const Component = mockupMap[type];
  return <Component />;
}

import { ClipboardList } from "lucide-react";

interface AuditRow {
  label: string;
  value: string;
  unit?: string;
}

interface InputAuditProps {
  rows: AuditRow[];
  lastUpdated?: string;
}

export default function InputAudit({ rows, lastUpdated }: InputAuditProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            สรุปข้อมูลที่ใช้คำนวณ
          </h3>
        </div>
        {lastUpdated && (
          <span className="timestamp">อัปเดต: {lastUpdated}</span>
        )}
      </div>
      <div className="divide-y">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium tabular-nums text-foreground">
              {row.value}
              {row.unit && (
                <span className="text-muted-foreground font-normal ml-1">
                  {row.unit}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

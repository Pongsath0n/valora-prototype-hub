import { ShieldCheck, AlertTriangle } from "lucide-react";

interface DataQualityBadgeProps {
  level: "estimated" | "confirmed";
  lastChecked?: string;
}

export default function DataQualityBadge({ level, lastChecked }: DataQualityBadgeProps) {
  const isConfirmed = level === "confirmed";

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
          isConfirmed
            ? "bg-success/10 text-success"
            : "bg-warning/10 text-warning"
        }`}
      >
        {isConfirmed ? (
          <ShieldCheck className="w-3 h-3" />
        ) : (
          <AlertTriangle className="w-3 h-3" />
        )}
        {isConfirmed ? "ยืนยันแล้ว" : "ประมาณการ"}
      </span>
      {lastChecked && (
        <span className="text-[10px] text-muted-foreground">
          ตรวจต้นทุนล่าสุด: {lastChecked}
        </span>
      )}
    </div>
  );
}

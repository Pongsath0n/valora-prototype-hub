import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

type DataQualityLevel = "estimated" | "confirmed";
type DataQualityStatus = "live" | "fallback" | "loading";

interface DataQualityBadgeProps {
  level: DataQualityLevel;
  status: DataQualityStatus;
  lastChecked?: string;
}

type StatusMeta = {
  label: string;
  badge: string;
  icon: typeof ShieldCheck;
  detail: (lastChecked?: string) => string;
  iconClassName?: string;
};

const STATUS_META: Record<DataQualityStatus, StatusMeta> = {
  live: {
    label: "ข้อมูลสดเชื่อมระบบ",
    badge: "bg-success/10 text-success",
    icon: ShieldCheck,
    detail: (lastChecked) =>
      lastChecked ? `อัปเดตข้อมูลล่าสุด ${lastChecked}` : "อัปเดตข้อมูลล่าสุดจากระบบ",
  },
  fallback: {
    label: "โหมดออฟไลน์ (ประมาณการ)",
    badge: "bg-warning/10 text-warning",
    icon: AlertTriangle,
    detail: () => "ใช้ข้อมูลประมาณการจากเครื่องนี้",
  },
  loading: {
    label: "กำลังโหลดข้อมูล...",
    badge: "bg-muted text-muted-foreground",
    icon: Loader2,
    iconClassName: "animate-spin",
    detail: () => "กำลังซิงค์ข้อมูลสดจากระบบ",
  },
};

const LEVEL_DETAIL: Record<DataQualityLevel, string> = {
  confirmed: "ต้นทุนยืนยันจากการซื้อเข้าสต็อกจริง",
  estimated: "ต้นทุนบางรายการยังเป็นค่าประมาณ",
};

export default function DataQualityBadge({ level, status, lastChecked }: DataQualityBadgeProps) {
  const statusMeta = STATUS_META[status];
  const Icon = statusMeta.icon;
  const statusDetail = statusMeta.detail(lastChecked);
  const levelDetail = LEVEL_DETAIL[level];

  return (
    <div className="text-left text-xs space-y-1">
      <span
        className={`inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full ${statusMeta.badge}`}
      >
        <Icon className={`w-3 h-3 ${statusMeta.iconClassName ?? ""}`} />
        {statusMeta.label}
      </span>
      <div className="text-[10px] text-muted-foreground leading-snug space-y-0.5">
        <div>{statusDetail}</div>
        <div>{levelDetail}</div>
      </div>
    </div>
  );
}

import SystemLayout from "@/components/system/SystemLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import { ShieldAlert, ShieldCheck } from "lucide-react";

const checklist = [
  {
    title: "Bucket: เมนู",
    description: "ภาพเมนูสำหรับ LIFF / Store Admin",
    status: "planned" as const,
  },
  {
    title: "Bucket: สลิปชำระเงิน",
    description: "หลักฐานการชำระเงินจากลูกค้า",
    status: "planned" as const,
  },
  {
    title: "Bucket: สินทรัพย์ร้านค้า",
    description: "โลโก้ แบนเนอร์ และไฟล์แบรนด์",
    status: "planned" as const,
  },
];

export default function SystemStoragePage() {
  return (
    <SystemLayout title="Storage Check" subtitle="ตรวจสอบ bucket ที่ใช้ใน Store Admin (read-only)">
      <section className="stat-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title mb-1">สถานะโดยรวม</h2>
            <p className="text-sm text-muted-foreground">
              ยังไม่เปิดการลบไฟล์อัตโนมัติ – รายการนี้เป็น checklist การตั้งค่าที่ต้องเตรียมใน production
            </p>
          </div>
          <StatusBadge label="planned" tone="info" />
        </div>
        <ul className="space-y-3">
          {checklist.map((item) => (
            <li key={item.title} className="flex items-center justify-between rounded-xl border px-3 py-2">
              <div>
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <StatusBadge label={item.status === "planned" ? "ยังไม่ได้ตรวจ" : "พร้อมใช้งาน"} tone={item.status === "planned" ? "warning" : "success"} />
            </li>
          ))}
        </ul>
      </section>

      <section className="stat-card space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <h2 className="section-title mb-0">สิ่งที่ต้องทำก่อนเปิด production</h2>
        </div>
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          <li>เปิดใช้งาน Supabase Storage และกำหนด policy สำหรับ owner/admin/staff</li>
          <li>ตั้งค่า Lifecycle Policy เพื่อลบไฟล์ orphaned ที่ไม่ถูกอ้างอิง</li>
          <li>เพิ่มระบบ scan สลิปเพื่อป้องกันไฟล์อันตราย (manual review ณ ตอนนี้)</li>
        </ul>
      </section>

      <section className="stat-card space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h2 className="section-title mb-0">ความปลอดภัยที่มีอยู่</h2>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>การอัปโหลดมาจาก Store Admin เท่านั้น พร้อม token ของเมมเบอร์</li>
          <li>ยังไม่มีการดาวน์โหลดผ่าน public bucket – ใช้ signed URL จาก backend</li>
          <li>Audit log ของการเข้าถึงไฟล์จะถูกเพิ่มใน Release ถัดไป</li>
        </ul>
      </section>
    </SystemLayout>
  );
}

import SystemLayout from "@/components/system/SystemLayout";

export default function SystemHealthPage() {
  return (
    <SystemLayout
      title="ตรวจสอบระบบ"
      subtitle="สถานะระบบพื้นฐาน, Storage และการเชื่อมต่อภายนอก"
    >
      <section className="stat-card space-y-2">
        <h2 className="section-title">System Health</h2>
        <p className="text-sm text-muted-foreground">
          TODO: ping Supabase, ตรวจ Storage bucket, ตรวจ LINE channel
          และแสดงสถานะแต่ละ component
        </p>
      </section>

      <section id="storage" className="stat-card space-y-2">
        <h2 className="section-title">Storage Check</h2>
        <p className="text-sm text-muted-foreground">
          TODO: เช็คขนาดและสุขภาพของ Supabase Storage bucket ที่ใช้เก็บสลิปและรูปเมนู
          พร้อมรายงานไฟล์ที่กำพร้า (ไม่มี reference) เพื่อให้ลบได้
        </p>
      </section>
    </SystemLayout>
  );
}

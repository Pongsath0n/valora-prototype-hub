import { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { storeSetupService } from "@/features/store/storeService";
import { useAuth } from "@/contexts/AuthContext";
import { STORE_DISPLAY_NAME } from "@/config/brand";

export default function AdminStoreSettingsPage() {
  const { user } = useAuth();
  const [shopName, setShopName] = useState(STORE_DISPLAY_NAME);
  const [daysOpen, setDaysOpen] = useState(26);
  const [targetProfit, setTargetProfit] = useState(30000);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    storeSetupService.get().then((store) => {
      if (!mounted) return;
      setShopName(store.name);
      setDaysOpen(store.daysOpen);
      setTargetProfit(store.targetProfit);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    await storeSetupService.save({ name: shopName, daysOpen, targetProfit });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <AdminLayout
      title="ตั้งค่าร้าน"
      subtitle="ข้อมูลร้าน เวลาเปิด-ปิด และเป้าหมายกำไรประจำเดือน"
    >
      <div className="max-w-2xl space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {loading ? "กำลังโหลด..." : saved ? "บันทึกแล้ว" : "บันทึกการตั้งค่า"}
          </button>
        </div>

        <div className="stat-card space-y-4">
          <div>
            <h2 className="section-title">ข้อมูลร้าน</h2>
            <p className="text-xs text-muted-foreground mt-0.5">ชื่อร้านและผู้ดูแลระบบ</p>
          </div>
          <div className="section-divider" />
          <div className="form-group">
            <label className="form-label">ชื่อร้าน</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">จำนวนวันเปิดต่อเดือน</label>
            <input
              type="number"
              value={daysOpen}
              onChange={(e) => setDaysOpen(Number(e.target.value))}
              min={1}
              max={31}
              className="form-input tabular-nums"
            />
          </div>
          <div className="form-group">
            <label className="form-label">เป้าหมายกำไร (฿/เดือน)</label>
            <input
              type="number"
              value={targetProfit}
              onChange={(e) => setTargetProfit(Number(e.target.value))}
              min={0}
              className="form-input tabular-nums"
            />
          </div>
          <div className="form-group">
            <label className="form-label">อีเมลผู้ดูแล</label>
            <input
              type="email"
              value={user?.email ?? "-"}
              readOnly
              className="form-input bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="form-hint">
              อีเมลเชื่อมกับบัญชี Supabase Auth ไม่สามารถเปลี่ยนที่นี่ได้
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

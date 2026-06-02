import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";

export default function CustomerMenuPage() {
  const [menus, setMenus] = useState<CustomerMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    customerApi
      .listMenu()
      .then((m) => setMenus(m))
      .catch((e: any) => setError(e?.message || "ไม่สามารถโหลดเมนูได้"))
      .finally(() => setLoading(false));
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="animate-pulse rounded-xl border p-4" />
          <div className="animate-pulse rounded-xl border p-4" />
          <p>กำลังโหลดเมนู...</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 rounded bg-primary px-3 py-1 text-primary-foreground"
            onClick={() => {
              setLoading(true);
              setError(null);
              customerApi
                .listMenu()
                .then((m) => setMenus(m))
                .catch((e: any) => setError(e?.message || "ไม่สามารถโหลดเมนูได้"))
                .finally(() => setLoading(false));
            }}
          >
            ลองใหม่
          </button>
        </div>
      );
    }
    if (menus.length === 0) {
      return (
        <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
          <p>ยังไม่มีเมนูที่พร้อมขายในตอนนี้</p>
          <p>โปรดลองใหม่อีกครั้งภายหลัง</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {menus.map((m) => (
          <Link
            key={m.id}
            to={`/liff/menu/${m.id}`}
            className="block rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{m.name}</p>
                {m.description ? (
                  <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                ) : null}
              </div>
              <p className="text-sm font-semibold">฿{m.price.toLocaleString()}</p>
            </div>
            {m.category ? (
              <p className="mt-2 text-xs text-muted-foreground">หมวด: {m.category}</p>
            ) : null}
          </Link>
        ))}
      </div>
    );
  }, [loading, error, menus]);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">เมนูสำหรับสั่งรับหน้าร้าน</h1>
      <p className="text-sm text-muted-foreground">เลือกเมนูที่ต้องการ แล้วกดเพิ่มในตะกร้า</p>
      {content}
    </div>
  );
}

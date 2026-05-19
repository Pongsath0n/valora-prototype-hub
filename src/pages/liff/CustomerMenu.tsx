import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMenus, type MenuItem } from "@/features/store/transactionApi";

export default function CustomerMenuPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMenus()
      .then(setMenus)
      .catch((e) => setError(e.message || "โหลดเมนูไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">สั่งเครื่องดื่มล่วงหน้า (รับที่ร้าน)</h1>
      {loading ? <p className="text-sm text-muted-foreground">กำลังโหลดเมนู...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {menus.map((m) => (
        <Link key={m.id} to={`/liff/menu/${m.id}`} className="block border rounded-xl p-3 active:scale-[0.99] transition">
          <p className="font-medium">{m.name}</p>
          <p className="text-sm text-muted-foreground">฿{Number(m.base_price || 0).toFixed(2)}</p>
        </Link>
      ))}
      {!loading && !menus.length ? <p className="text-sm text-muted-foreground">ยังไม่มีเมนูที่พร้อมขาย</p> : null}
    </div>
  );
}

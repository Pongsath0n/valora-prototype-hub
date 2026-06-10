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
            className="group block rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted">
                {m.image_url ? (
                  <img
                    src={m.image_url}
                    alt={m.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">ไม่มีรูป</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{m.name}</p>
                    {m.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
                    ) : null}
                    {m.category ? (
                      <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {m.category}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    ฿{m.price.toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-end">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    เลือกเมนูนี้
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  }, [loading, error, menus]);

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">เมนูร้าน</h1>
        <p className="text-sm text-muted-foreground">
          เลือกเมนูที่ต้องการ แล้วกดเพิ่มลงตะกร้าได้เลย ไม่ต้องสมัครหรือล็อกอิน
        </p>
      </div>

      <div className="rounded-2xl border bg-white/80 p-4 text-sm text-muted-foreground space-y-2">
        <div>
          <p className="text-sm font-semibold text-foreground">การใช้ข้อมูลส่วนตัว</p>
          <p>ร้านจะใช้ข้อมูลเฉพาะที่จำเป็นสำหรับ:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>รับและจัดเตรียมคำสั่งซื้อ</li>
            <li>ตรวจสอบการชำระเงินและหลักฐานการโอน</li>
            <li>แจ้งเตือนความคืบหน้าและสถานะคำสั่งซื้อ</li>
            <li>นัดหมายเวลารับสินค้า</li>
            <li>ประสานงานบริการหลังการขาย</li>
          </ul>
        </div>
        <p className="text-xs">
          ข้อมูลที่เกี่ยวข้อง ได้แก่ ชื่อ เบอร์โทร รายการสั่งซื้อ เวลารับสินค้า และหลักฐานการชำระเงิน เพื่อให้บริการตามรายการที่ลูกค้าร้องขอเท่านั้น
        </p>
        <p className="text-xs">
          อ่านรายละเอียดเพิ่มเติมได้ที่{" "}
          <Link to="/privacy" className="font-semibold text-primary underline">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          to="/liff/cart"
          className="flex-1 rounded-full border border-primary/40 px-4 py-2 text-center text-sm font-semibold text-primary"
        >
          ดูตะกร้า
        </Link>
        <Link
          to="/order/status"
          className="flex-1 rounded-full border px-4 py-2 text-center text-sm font-semibold text-muted-foreground"
        >
          เช็กสถานะออเดอร์
        </Link>
      </div>

      {content}
    </div>
  );
}

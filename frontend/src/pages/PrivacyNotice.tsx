import { Link } from "react-router-dom";

const DATA_POINTS = [
  "ชื่อ นามสกุล หรือชื่อที่ติดต่อ",
  "เบอร์โทรศัพท์",
  "รายการสั่งซื้อและจำนวน",
  "เวลารับสินค้าที่ลูกค้าระบุ",
  "หลักฐานการชำระเงิน / สลิปโอน",
];

const PURPOSES = [
  "รับคำสั่งซื้อและยืนยันรายละเอียด",
  "ตรวจสอบยอดโอนและสถานะการชำระเงิน",
  "แจ้งเตือนความคืบหน้าของออเดอร์",
  "นัดหมายเวลารับสินค้าและประสานงานหลังการขาย",
];

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <p className="text-sm font-semibold text-primary/80">นโยบายความเป็นส่วนตัว</p>
        <h1 className="text-3xl font-bold tracking-tight">การใช้ข้อมูลสำหรับการสั่งซื้อ</h1>
        <p className="text-sm text-muted-foreground">
          หน้านี้สรุปวิธีที่ร้านใช้ข้อมูลลูกค้าเพื่อให้บริการสั่งซื้อ การชำระเงิน และการรับสินค้า
        </p>
      </header>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">ข้อมูลที่เก็บ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          เก็บเท่าที่จำเป็นต่อการให้บริการเท่านั้น ได้แก่
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
          {DATA_POINTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">วัตถุประสงค์ในการใช้ข้อมูล</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
          {PURPOSES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          สลิปหรือหลักฐานการโอนจะถูกใช้เพื่อตรวจสอบยอดเงินและยืนยันคำสั่งซื้อเท่านั้น ไม่เผยแพร่ต่อสาธารณะ
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">การเข้าถึงข้อมูล</h2>
        <p className="text-sm text-muted-foreground">
          เฉพาะทีมเจ้าของร้านและผู้ดูแลระบบที่ได้รับมอบหมายเท่านั้นที่สามารถเข้าถึงข้อมูลดังกล่าว เพื่อใช้ในการบริการลูกค้าตามคำสั่งซื้อ ไม่มีการขายหรือโอนไปยังบุคคลที่สาม
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">ช่องทางติดต่อ</h2>
        <p className="text-sm text-muted-foreground">
          หากต้องการสอบถาม แก้ไข หรือยกเลิกข้อมูล โปรดติดต่อทีมร้านผ่านช่องทาง LINE OA หรือหมายเลขที่ระบุในหน้าสั่งซื้อ
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">ขอบเขตการใช้งาน</h2>
        <p className="text-sm text-muted-foreground">
          นโยบายนี้ครอบคลุมการบริการสั่งซื้อ รับสินค้า และแจ้งสถานะภายใน Valora เท่านั้น ไม่รวมบริการอื่นที่ยังไม่ได้เปิดใช้งาน เช่น LINE LIFF หรือการเชื่อมต่อภายนอก
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/order"
          className="flex-1 rounded-full border border-primary/40 px-4 py-2 text-center text-sm font-semibold text-primary"
        >
          กลับไปหน้าเมนูสั่งซื้อ
        </Link>
        <Link
          to="/liff/confirm"
          className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground"
        >
          ไปยืนยันออเดอร์
        </Link>
      </div>
    </div>
  );
}

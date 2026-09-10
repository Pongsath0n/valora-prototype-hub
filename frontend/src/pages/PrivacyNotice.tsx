import { Link } from "react-router-dom";

// ─── V1 Customer data actually collected (per OrderConfirm payload) ────────
// Source of truth: frontend/src/pages/liff/OrderConfirm.tsx
//   customer.name (required), items[], note (optional)
// No phone, email, LINE identity, pickup time, slip, or bank account.
const DATA_POINTS = [
  "ชื่อสำหรับการสั่งซื้อ",
  "รายการสั่งซื้อและจำนวน",
  "ตัวเลือก/ส่วนเสริมของแต่ละรายการ (ถ้ามี)",
  "หมายเหตุที่ลูกค้าระบุ (ถ้ามี)",
];

// ─── V1 does NOT request these from Customer ───────────────────────────────
const NOT_COLLECTED = [
  "เบอร์โทรศัพท์",
  "อีเมล",
  "LINE ID / LINE User ID",
  "เวลารับสินค้า (pickup time)",
  "สลิปการชำระเงิน",
  "เลขบัญชีธนาคารของลูกค้า",
  "ข้อมูลบัตรเครดิต/เดบิต",
];

// ─── Processing purposes with legal basis ──────────────────────────────────
// PDPA B.E. 2562 — do NOT default everything to consent.
// Order fulfillment = contract performance; security = legitimate interests.
const PURPOSES_WITH_BASIS = [
  {
    purpose: "รับและดำเนินการตามคำสั่งซื้อ รวมถึงการให้บริการที่เกี่ยวข้อง",
    basis: "ความจำเป็นเพื่อการปฏิบัติตามสัญญา หรือการดำเนินการตามคำขอของเจ้าของข้อมูลก่อนเข้าทำสัญญา",
  },
  {
    purpose: "แจ้งสถานะออเดอร์ผ่านหน้าเว็บโดยใช้กลไกการเข้าถึงเฉพาะออเดอร์ (public token)",
    basis: "ความจำเป็นเพื่อการปฏิบัติตามสัญญา",
  },
  {
    purpose: "ยืนยันตัวตนลูกค้าที่เคาน์เตอร์เพื่อส่งมอบสินค้า",
    basis: "ความจำเป็นเพื่อการปฏิบัติตามสัญญา",
  },
  {
    purpose: "บันทึกการรับชำระเงินที่เคาน์เตอร์ (เงินสด/QR) เพื่อยืนยันการให้บริการ",
    basis: "ความจำเป็นเพื่อการปฏิบัติตามสัญญา",
  },
  {
    purpose: "ป้องกันการเข้าถึงออเดอร์โดยไม่ได้รับอนุญาต และรักษาความมั่นคงปลอดภัยของระบบ",
    basis: "ประโยชน์โดยชอบด้วยกฎหมาย โดยคำนึงถึงสิทธิและเสรีภาพของเจ้าของข้อมูลส่วนบุคคล",
  },
];

const ROLE_ACCESS = [
  {
    role: "ลูกค้า (Customer)",
    desc: "เห็นเฉพาะข้อมูลออเดอร์ของตนเองผ่านกลไกการเข้าถึงเฉพาะออเดอร์ ไม่เห็นข้อมูลภายในร้าน",
  },
  {
    role: "พนักงาน (Staff)",
    desc: "เห็นข้อมูลออเดอร์ที่จำเป็นต่อการปฏิบัติงาน ไม่เห็นข้อมูลต้นทุนและกำไร",
  },
  {
    role: "ผู้จัดการ (Manager)",
    desc: "เห็นข้อมูลการดำเนินงานของร้านตามบทบาท ไม่สามารถยกเลิกออเดอร์ได้",
  },
  {
    role: "เจ้าของร้าน (Owner)",
    desc: "เห็นข้อมูลการดำเนินงาน ต้นทุน กำไร และวางแผนกำไร รวมถึงการยกเลิกออเดอร์ที่อยู่ในเงื่อนไขที่กำหนด",
  },
];

const RIGHTS = [
  "ขอเข้าถึงและขอสำเนาข้อมูลส่วนบุคคลที่ระบบเก็บเกี่ยวกับตนเอง",
  "ขอให้แก้ไขข้อมูลที่ไม่ถูกต้อง",
  "ขอให้ลบข้อมูล หรือขอจำกัดขอบเขตการใช้ข้อมูล",
  "คัดค้านการประมวลผล หรือเพิกถอนความยินยอมในกรณีที่การประมวลผลอาศัยความยินยอม",
  "ขอร้องเรียนต่อหน่วยงานที่เกี่ยวข้องตามที่กฎหมายกำหนด",
];

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <p className="text-sm font-semibold text-primary/80">นโยบายความเป็นส่วนตัว</p>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Notice สำหรับการสั่งซื้อ</h1>
        <p className="text-sm text-muted-foreground">
          หน้านี้อธิบายวิธีที่ Healholic เก็บและใช้ข้อมูลของลูกค้าเพื่อให้บริการสั่งซื้อ ติดตามสถานะ และดำเนินงานร้าน
        </p>
      </header>

      {/* 1. Privacy Notice นี้เกี่ยวกับอะไร */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">1. Privacy Notice นี้เกี่ยวกับอะไร</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          นโยบายความเป็นส่วนตัวนี้อธิบายว่า Healholic เก็บข้อมูลใด ใช้เพื่อวัตถุประสงค์ใด บนฐานทางกฎหมายใด
          และผู้ใดสามารถเข้าถึงข้อมูลได้ โดยครอบคลุมเฉพาะบริการสั่งซื้อและติดตามสถานะออเดอร์
          ในระบบ Healholic V1 ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
        </p>
      </section>

      {/* 2. ผู้ควบคุมข้อมูล / ผู้รับผิดชอบการประมวลผล */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">2. ผู้ควบคุมข้อมูลส่วนบุคคล</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ร้าน Healholic เป็นผู้กำหนดวัตถุประสงค์และการใช้งานข้อมูลส่วนบุคคลของลูกค้า
          เพื่อดำเนินการตามคำสั่งซื้อและการให้บริการของร้าน
          จึงทำหน้าที่เป็นผู้ควบคุมข้อมูลส่วนบุคคลในบริบทดังกล่าว
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Valora และผู้ดูแลระบบที่ให้บริการด้านซอฟต์แวร์และโครงสร้างระบบ
          ประมวลผลข้อมูลตามขอบเขตที่จำเป็นต่อการให้บริการระบบแก่ร้าน Healholic
          และไม่ได้เป็นเจ้าของข้อมูลส่วนบุคคลของลูกค้า
        </p>
      </section>

      {/* 3. ข้อมูลที่เก็บ */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">3. ข้อมูลที่ระบบเก็บจากลูกค้า</h2>
        <p className="mt-1 text-sm text-muted-foreground">เก็บเท่าที่จำเป็นต่อการให้บริการสั่งซื้อเท่านั้น ได้แก่</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
          {DATA_POINTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {/* 4. ข้อมูลที่ Customer V1 ไม่ได้ขอ */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">4. ข้อมูลที่ Healholic V1 ไม่ได้ขอจากลูกค้า</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ในเวอร์ชันปัจจุบัน ระบบไม่ได้ขอข้อมูลต่อไปนี้จากลูกค้าในขั้นตอนการสั่งซื้อ:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
          {NOT_COLLECTED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          การชำระเงินกระทำที่เคาน์เตอร์เมื่อพนักงานเรียกชื่อ ระบบไม่เก็บข้อมูลการชำระเงินของลูกค้าผ่านระบบออนไลน์
        </p>
      </section>

      {/* 5. วัตถุประสงค์และฐานการประมวลผล */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">5. วัตถุประสงค์และฐานการประมวลผลข้อมูล</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ระบบประมวลผลข้อมูลตามวัตถุประสงค์ต่อไปนี้ บนฐานทางกฎหมายที่เหมาะสมตาม PDPA:
        </p>
        <ul className="mt-3 space-y-3 text-sm text-foreground">
          {PURPOSES_WITH_BASIS.map((item) => (
            <li key={item.purpose}>
              <p className="font-medium">{item.purpose}</p>
              <p className="text-muted-foreground">ฐานการประมวลผล: {item.basis}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          ใน Healholic V1 ข้อมูลที่ลูกค้าให้สำหรับการสั่งซื้อ
          ไม่ได้ถูกนำไปใช้เพื่อการโฆษณาหรือสร้างโปรไฟล์ทางการตลาดภายในระบบ
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ระบบ V1 ไม่ใช้ข้อมูลลูกค้าเพื่อการสร้างโปรไฟล์หรือการตัดสินใจอัตโนมัติที่มีผลสำคัญต่อลูกค้า
        </p>
      </section>

      {/* 6. การเข้าถึงข้อมูลตามบทบาท */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">6. การเข้าถึงข้อมูลตามบทบาท</h2>
        <ul className="mt-3 space-y-3 text-sm text-foreground">
          {ROLE_ACCESS.map((item) => (
            <li key={item.role}>
              <p className="font-medium">{item.role}</p>
              <p className="text-muted-foreground">{item.desc}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          ข้อมูลบัญชีของผู้ใช้งานภายในร้านจะถูกใช้เพื่อยืนยันตัวตน กำหนดสิทธิ์การเข้าถึง
          และรักษาความปลอดภัยในการใช้งานระบบ ตามหน้าที่และสิทธิ์ของผู้ใช้งานแต่ละประเภท
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ข้อมูลต้นทุน กำไร และการวางแผนกำไร ไม่เปิดเผยต่อลูกค้าหรือพนักงานทั่วไป
        </p>
      </section>

      {/* 7. ผู้ให้บริการระบบ / ผู้ประมวลผล */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">7. ผู้ให้บริการระบบและผู้ประมวลผลข้อมูล</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ระบบอาจใช้ผู้ให้บริการด้าน Cloud, Hosting, Database, Authentication และ Storage
          เพื่อสนับสนุนการทำงานของระบบ โดยจะให้ผู้ให้บริการเข้าถึงหรือประมวลผลข้อมูลเท่าที่จำเป็น
          ตามหน้าที่ของบริการ และจะจัดการการใช้ผู้ให้บริการดังกล่าว
          ให้สอดคล้องกับข้อกำหนดด้านการคุ้มครองข้อมูลส่วนบุคคลที่เกี่ยวข้อง
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          ระบบ V1 ปัจจุบันไม่ได้ใช้บริการ LINE OA หรือผู้ให้บริการชำระเงินออนไลน์ในกระบวนการสั่งซื้อของลูกค้า
        </p>
      </section>

      {/* 8. การประมวลผลหรือโอนข้อมูลระหว่างประเทศ */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">8. การประมวลผลหรือโอนข้อมูลระหว่างประเทศ</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Healholic อาจใช้ผู้ให้บริการด้าน Cloud, Hosting, Database, Authentication และ Storage
          ซึ่งระบบของผู้ให้บริการอาจมีการประมวลผลหรือจัดเก็บข้อมูลในประเทศไทยหรือต่างประเทศ
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ในกรณีที่มีการส่งหรือโอนข้อมูลส่วนบุคคลไปต่างประเทศ
          Healholic จะดำเนินการให้เป็นไปตามกฎหมายคุ้มครองข้อมูลส่วนบุคคลที่ใช้บังคับ
          และมาตรการที่เกี่ยวข้องตามความเหมาะสม
        </p>
      </section>

      {/* 9. ระยะเวลาการเก็บ */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">9. ระยะเวลาการเก็บรักษาข้อมูล</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ข้อมูลจะถูกเก็บรักษาเท่าที่จำเป็นต่อวัตถุประสงค์ในการให้บริการ การดำเนินงานของร้าน
          การรักษาความปลอดภัย และการปฏิบัติตามกฎหมายที่เกี่ยวข้อง
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          เมื่อข้อมูลไม่จำเป็นต่อวัตถุประสงค์ดังกล่าวแล้ว
          Healholic จะดำเนินการจัดการข้อมูลตามนโยบายและข้อกำหนดที่เกี่ยวข้อง
        </p>
      </section>

      {/* 10. ความปลอดภัย */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">10. การรักษาความปลอดภัย</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ระบบใช้มาตรการทางเทคนิคและองค์กรที่เหมาะสมเพื่อป้องกันการเข้าถึงข้อมูลโดยไม่ได้รับอนุญาต
          การเข้าถึงข้อมูลภายในร้านถูกจำกัดตามบทบาทของผู้ใช้งาน อย่างไรก็ตาม
          ไม่มีระบบใดที่รับประกันความปลอดภัยได้สมบูรณ์แบบ
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ระบบอาจบันทึกข้อมูลการใช้งานและเหตุการณ์ที่จำเป็นต่อการรักษาความปลอดภัย การตรวจสอบปัญหา
          และการตรวจสอบการทำงานของระบบ โดยอาศัยประโยชน์โดยชอบด้วยกฎหมายตามความเหมาะสม
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ปัจจุบัน Healholic V1 ไม่มีการใช้ระบบโฆษณาติดตามพฤติกรรมของลูกค้าภายใน flow การสั่งซื้อ
          การจัดเก็บข้อมูลในเบราว์เซอร์ของลูกค้ามีเพียงเพื่อการทำงานของระบบ เช่น ตะกร้าสั่งซื้อ
          และการเข้าถึงสถานะออเดอร์
        </p>
      </section>

      {/* 11. สิทธิของเจ้าของข้อมูล */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">11. สิทธิของเจ้าของข้อมูล</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ลูกค้าสามารถใช้สิทธิต่อไปนี้ได้ตามหลักเกณฑ์ เงื่อนไข และข้อยกเว้นที่กฎหมายกำหนด:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
          {RIGHTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {/* 12. การติดต่อ */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">12. การติดต่อ</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ช่องทางติดต่อเกี่ยวกับระบบหรือการใช้สิทธิด้านข้อมูลส่วนบุคคล:
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">pongsathon.officialwork@gmail.com</p>
      </section>

      {/* 13. การเปลี่ยนแปลง Privacy Notice */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">13. การเปลี่ยนแปลง Privacy Notice</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ร้านอาจปรับปรุงนโยบายความเป็นส่วนตัวนี้ตามความจำเป็น เมื่อมีการเปลี่ยนแปลงจะแจ้งในหน้านี้
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
          to="/order/confirm"
          className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground"
        >
          ไปยืนยันออเดอร์
        </Link>
      </div>
    </div>
  );
}

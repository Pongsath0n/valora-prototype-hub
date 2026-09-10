# Healholic — Valora V1

**สถานะปัจจุบัน:** Soft Launch

| Field | Value |
|---|---|
| Branch | `Healholic-graphic` |
| Frontend V1 commit | `2595a528690ca9b23e2e430b858f79a464312fa5` |
| Tag | `healholic-frontend-v1` |
| Backend freeze tag | `healholic-backend-v1` / `healholic-backend-v1.1` |

Healholic คือร้านที่ใช้ระบบ Valora ในการวางแผนกำไรและดำเนินงานร้านค้าขนาดเล็ก Valora เป็นแพลตฟอร์มช่วยเจ้าของร้านเล็กวางแผนกำไร เห็นต้นทุนจริง จุดคุ้มทุน และจำนวนยอดขายที่ต้องทำเพื่อถึงเป้ากำไร โดยออกแบบให้เหมาะกับร้านกาแฟ ร้านเครื่องดื่ม ร้านอาหารขนาดเล็ก และ SMEs ที่ต้องการระบบช่วยตัดสินใจโดยไม่ซับซ้อนเหมือน ERP ขนาดใหญ่

---

## ภาพรวมของระบบ

Valora เป็นระบบช่วยวางแผนกำไรและการดำเนินงานเบื้องต้นสำหรับร้านเล็ก โดยเชื่อมข้อมูลคำสั่งซื้อ ต้นทุนวัตถุดิบ สูตร และค่าใช้จ่ายประจำเข้าด้วยกันในมุมมองเดียว ผู้ใช้เห็นสถานะกำไรจริง เทียบกับจุดคุ้มทุน และจำลองสถานการณ์ได้ก่อนตัดสินใจขยายร้านหรือเพิ่มสินค้าใหม่

Healholic คือร้านที่ใช้ระบบ Valora V1 ในการดำเนินงานจริง

---

## จุดยืนของระบบ

- **Profit Planning** เป็นหัวใจหลัก ฟังก์ชันอื่นถูกออกแบบเพื่อสนับสนุนความแม่นยำของแผนกำไร
- ระบบเน้นช่วยผู้ประกอบการขนาดเล็กและ SME ให้ตัดสินใจจากข้อมูลจริง โดยไม่ต้องใช้งาน ERP เต็มรูปแบบ
- มี Owner dashboard ที่สรุปข้อมูลแผนกำไร 5 ส่วน พร้อมตัวชี้วัดเฉลี่ยต่อแก้วและรายเดือน

---

## สิ่งที่ Healholic V1 ทำได้

- วางแผนกำไรสำหรับร้านกาแฟ/SME ด้วยเครื่องยนต์ Profit Planning
- คำนวณต้นทุนวัตถุดิบ/บรรจุภัณฑ์ตามสูตรเมนู (Recipe / direct cost)
- จัดการต้นทุนแฝงและค่าใช้จ่ายประจำ พร้อมเฉลี่ยต่อแก้วตามแผน
- ตั้งสมมติฐานการขายและนำไปผูกกับจุดคุ้มทุนต่อเดือน/ต่อวัน
- คำนวณจำนวนแก้วที่ต้องขายเพื่อถึงเป้ากำไร
- วิเคราะห์กำไรรายสินค้าและดูผลกระทบต่อกำไรรวม
- จำลองสถานการณ์ (Scenario simulation) เพื่อดูผลแผนใหม่ทันที
- รับออเดอร์ลูกค้าผ่านหน้าเว็บสาธารณะ พร้อมติดตามสถานะผ่าน public token
- รับชำระเงินที่เคาน์เตอร์ (เงินสด หรือ PromptPay QR แบบคงที่) พร้อมยืนยันการรับเงินโดยพนักงาน
- Staff Kiosk สำหรับขายหน้าร้าน (walk-in cart, ตัวเลือกสินค้า, ชำระเงินสด/QR)
- Incoming Queue แสดงออเดอร์ที่ยังไม่ชำระเงิน
- Production Queue แสดงออเดอร์ที่ชำระแล้วเรียงตาม FIFO
- การยกเลิกออเดอร์โดย Owner เท่านั้น ในสถานะที่กำหนด
- Owner/Manager/Staff แยกบทบาทสิทธิ์อย่างชัดเจน ส่วน Customer เห็นเฉพาะ flow สั่งซื้อและสถานะ

---

## Customer Flow (V1)

```
/order (เลือกสินค้า)
  → /order/:productId (รายละเอียด/ตัวเลือก)
  → /order/cart (ตะกร้า)
  → /order/confirm (กรอกชื่อ + หมายเหตุ + ยินยอมนโยบาย)
  → pending_payment (รอชำระที่เคาน์เตอร์)
  → Incoming Queue (Staff เห็นออเดอร์)
  → ชำระที่เคาน์เตอร์ (เงินสด หรือ PromptPay QR คงที่)
  → Staff ยืนยันการรับเงิน
  → Production Queue (เตรียม/พร้อม/เสร็จ)
  → Customer ติดตามสถานะผ่าน /order/status (public token)
```

**ข้อมูลที่ระบบเก็บจากลูกค้า:**
- `customer_name` (จำเป็น)
- `note` (หมายเหตุ — ไม่บังคับ)

**V1 ไม่ได้ขอจากลูกค้า:**
- เบอร์โทรศัพท์, อีเมล, LINE ID
- เวลารับสินค้า (pickup time)
- สลิปการชำระเงิน
- ข้อมูลบัตร/บัญชีธนาคาร

ลูกค้าไม่ต้องชำระเงินออนไลน์ และไม่ต้องอัปโหลดสลิป

---

## Staff Kiosk (V1)

Staff Kiosk เป็นฟีเจอร์ที่ใช้งานใน V1 สำหรับการขายหน้าร้าน:

- ตะกร้า walk-in (เพิ่มสินค้า/จำนวน/ตัวเลือก/ส่วนเสริม)
- ชำระเงินด้วย **เงินสด** หรือ **PromptPay QR แบบคงที่** (Static QR ของร้าน)
- พนักงานเป็นผู้ยืนยันการรับเงิน (manual finalize)
- การชำระเงินและตัดสต็อกเป็น transaction เดียว (atomic)
- แสดงการแจ้งเตือน Incoming (ออเดอร์ใหม่สูงสุด 3 รายการใน Kiosk view)
- ลิงก์ไปยัง Staff Orders queue ทั้งหมด
- รองรับการใช้งานบน iPad/Safari

Kiosk ไม่ใช่ระบบ POS ขนาดองค์กร แต่เป็นเครื่องมือขายหน้าร้านสำหรับ V1

---

## Queues

### Incoming Queue
- ออเดอร์ที่ยังไม่ชำระเงิน (self-order จากเว็บ)
- FIFO (เข้าก่อนออกก่อน)
- สถานะ `pending_payment`
- Polling ทุก 15 วินาที + optional Realtime invalidation
- Kiosk แสดงสูงสุด 3 รายการ พร้อมตัวเลขรวมและ overflow summary

### Production Queue
- ออเดอร์ที่ชำระแล้ว
- FIFO ตาม `payment_confirmed_at` (เวลาที่ยืนยันการชำระ)
- สถานะ: `accepted` → `preparing` → `ready` → `completed`
- ไม่มี client-side source priority — ทั้ง web_order และ kiosk ใช้ FIFO เดียวกัน

---

## Cancellation

- การยกเลิกออเดอร์เป็นสิทธิ์ของ **Owner เท่านั้น** (`currentStoreRole === "owner"`)
- สถานะที่ยกเลิกได้: `pending_payment`, `accepted`
- สถานะที่ยกเลิกไม่ได้: `preparing`, `ready`, `completed`, `cancelled`, `voided`
- Staff และ Manager ไม่สามารถยกเลิกออเดอร์ได้
- ใช้ canonical endpoint `POST /api/store-admin/orders/{id}/cancel`

---

## Profit Planning

**Route:** `/owner/profit-planning` (Owner-only)

Profit Planning เป็นฟีเจอร์ช่วยตัดสินใจ (decision-support) ประกอบด้วย:

1. **Planning Baseline** — ข้อมูลพื้นฐานจากระบบ (ต้นทุน ราคา สูตร)
2. **Planning Assumptions** สมมติฐานการวางแผน (ยอดขายเป้าหมาย จำนวนแก้ว/วัน ราคาเฉลี่ย)
3. **Scenario / Projection** — จำลองสถานการณ์เพื่อดูผลลัพธ์แบบ what-if

Profit Planning **ไม่ใช่**:
- ระบบบัญชีที่ผ่านการสอบบัญชี
- รายงานภาษี
- งบการเงินที่รับรอง
- "กำไรจริง" ตามบัญชี — ผลลัพธ์เป็นการคาดการณ์ตามสมมติฐานที่ผู้ใช้ตั้ง

Legacy route `/app/planning` ยังคง redirect ไปยัง `/owner/profit-planning`

---

## Realtime

- **REST API** เป็น source of truth
- **Polling** ทุก 15 วินาที (fallback refresh)
- **Realtime** เป็น optional invalidation accelerator — เมื่อมีการเปลี่ยนแปลงในฐานข้อมูล ระบบจะแจ้งให้ frontend ไป refetch REST API
- Production default: `VITE_ENABLE_STORE_ORDERS_REALTIME=false`
- ไม่ได้เปิดใช้ Realtime ใน Production โดย default

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | FastAPI (Python) |
| Database / Auth / Storage | Supabase (PostgreSQL) |
| Frontend Hosting | Vercel |
| Backend Hosting | Railway |

**V1 ไม่ได้ใช้:**
- LINE OA ในกระบวนการสั่งซื้อของลูกค้า
- Payment gateway ออนไลน์
- Dynamic PromptPay QR generation
- Slip verification
- Automated bank verification

---

## การรันระบบสำหรับพัฒนา

เตรียม Node.js v18+, npm, Python 3.10+, และ Supabase credentials ก่อนเริ่ม

### Backend

```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# http://127.0.0.1:8000
```

### Frontend

```bash
cd frontend
npm run dev
# http://127.0.0.1:5174/
```

---

## Release Validation (Frontend V1)

| Metric | Result |
|---|---|
| Tests | 893 passed / 0 failed |
| Test files | 55 passed |
| Build | PASS |
| TypeScript | 0 errors |
| ESLint | 0 errors / 23 warnings |

หมายเหตุ: `CounterPaymentDialog` test มีอาการ flake บางครั้งจาก timer teardown หลัง test จบ แต่การรันซ้ำผ่านเสมอ ไม่ใช่ regression

---

## สิ่งที่ Healholic V1 ไม่ใช่

- ไม่ใช่ ERP เต็มรูปแบบหรือระบบบัญชีครบวงจร
- ไม่ใช่ระบบภาษีหรือการยื่นแบบอัตโนมัติ
- ไม่ใช่ระบบเงินเดือนหรือ Payroll
- ไม่ใช่ระบบ Inventory Accounting ระดับองค์กร
- ไม่ใช่ระบบ CRM เชิงลึก
- ไม่ใช่ Payment gateway
- ไม่ใช่ระบบตรวจสลิปอัตโนมัติ
- ไม่ใช่ระบบที่รับชำระเงินออนไลน์จากลูกค้า

> Healholic V1 โฟกัสที่การวางแผนกำไร การดำเนินงานร้านเบื้องต้น และการช่วยตัดสินใจของธุรกิจขนาดเล็ก

---

## บทบาทผู้ใช้และความปลอดภัย

- **Owner:** เห็นข้อมูลวางแผนกำไร ต้นทุน สมมติฐาน รายงาน และสามารถยกเลิกออเดอร์ในสถานะที่กำหนด
- **Manager:** เห็นข้อมูลการดำเนินงานของร้าน ไม่สามารถยกเลิกออเดอร์ได้
- **Staff:** จัดการออเดอร์และรับชำระเงินที่เคาน์เตอร์ ไม่เห็นข้อมูลต้นทุน กำไร หรือค่าใช้จ่ายแฝง
- **Customer:** ใช้งานเฉพาะหน้าสั่งซื้อและติดตามสถานะผ่าน public token ไม่เห็นข้อมูลภายในร้าน

---

## ข้อควรระวัง

- ห้าม commit ไฟล์ `.env` หรือข้อมูลลับใด ๆ ลง repository
- ห้ามเปิดเผย token, Supabase keys หรือ secrets ในเอกสารสาธารณะ
- ตรวจสอบและผ่านการทดสอบในเครื่องให้ครบก่อนขึ้นระบบจริง

---

## Contact

สำหรับคำถามหรือข้อสงสัย ติดต่อทีมพัฒนา
pongsathon.officialwork@gmail.com

## License

Copyright © 2026 Valora Hub. All rights reserved.

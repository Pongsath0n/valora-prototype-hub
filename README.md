# Healholic — Valora V1

**สถานะปัจจุบัน:** Soft Launch (V1 + post-V1 operational patches)

| Field | Value |
|---|---|
| Branch | `Healholic-graphic` |
| Frontend V1 frozen tag | `healholic-frontend-v1` @ `2595a528690ca9b23e2e430b858f79a464312fa5` |
| Backend freeze tag | `healholic-backend-v1` / `healholic-backend-v1.1` |

Valora เป็นแพลตฟอร์มช่วยเจ้าของร้านเล็กวางแผนกำไร เห็นต้นทุนจริง จุดคุ้มทุน และจำนวนยอดขายที่ต้องทำเพื่อถึงเป้ากำไร โดยออกแบบให้เหมาะกับร้านกาแฟ ร้านเครื่องดื่ม ร้านอาหารขนาดเล็ก และ SMEs ที่ต้องการระบบช่วยตัดสินใจโดยไม่ซับซ้อนเหมือน ERP ขนาดใหญ่

Healholic คือร้านที่ใช้ระบบ Valora V1 ในการดำเนินงานจริง ปัจจุบัน branch `Healholic-graphic` มี post-V1 patches เพิ่มเติมจาก frozen tag โดยยังไม่ได้ย้ายหรือแก้ไข tag ดั้งเดิม

---

## ภาพรวมของระบบ

Valora เป็นระบบช่วยวางแผนกำไรและการดำเนินงานเบื้องต้นสำหรับร้านเล็ก โดยเชื่อมข้อมูลคำสั่งซื้อ ต้นทุนวัตถุดิบ สูตร และค่าใช้จ่ายประจำเข้าด้วยกันในมุมมองเดียว ผู้ใช้เห็นสถานะกำไรจริง เทียบกับจุดคุ้มทุน และจำลองสถานการณ์ได้ก่อนตัดสินใจขยายร้านหรือเพิ่มสินค้าใหม่

Healholic คือร้านที่ใช้ระบบ Valora V1 ในการดำเนินงานจริง

---

## จุดยืนของระบบ

- **Profit Planning** เป็นหัวใจหลัก ฟังก์ชันอื่นถูกออกแบบเพื่อสนับสนุนความแม่นยำของแผนกำไร
- ระบบเน้นช่วยผู้ประกอบการขนาดเล็กและ SME ให้ตัดสินใจจากข้อมูลจริง โดยไม่ต้องใช้งาน ERP เต็มรูปแบบ
- มี Owner Dashboard ที่สรุปข้อมูลแผนกำไร พร้อมตัวชี้วัดเฉลี่ยต่อแก้วและรายเดือน รวมถึงต้นทุนจัดซื้อและความสูญเสีย

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
- บันทึกการซื้อเข้าสต็อก (Stock Intake) พร้อมหรือไม่มีใบเสร็จซื้อ (Purchase Receipt)
- บันทึกการทิ้งสต็อก (Waste) สำหรับวัตถุดิบที่มีสต็อกคงเหลือ ไม่จำกัดเฉพาะของหมดอายุ
- Owner Dashboard แสดงต้นทุนจัดซื้อและความสูญเสีย (Procurement & Waste Analytics)
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
  → ตัดสต็อกอัตโนมัติ (atomic)
  → Production Queue (preparing → ready → completed)
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

## Staff / Counter Payment (V1)

การชำระเงินใน V1 เป็นแบบเคาน์เตอร์เท่านั้น:

- **เงินสด** หรือ **PromptPay QR แบบคงที่** (Static QR ของร้าน)
- พนักงานเป็นผู้ยืนยันการรับเงิน (manual finalize)
- การชำระเงินและตัดสต็อกเป็น transaction เดียว (atomic)

V1 ไม่ได้ใช้:
- Payment gateway ออนไลน์
- Dynamic PromptPay QR generation
- การอัปโหลดสลิปโดยลูกค้า
- การตรวจสอบสลิปอัตโนมัติ
- การยืนยันการชำระผ่าน LINE

Legacy payment-slip code อาจยังคงอยู่ใน repository แต่ไม่ใช่ workflow หลักของลูกค้าใน V1

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
- การยกเลิกออเดอร์ที่ชำระแล้วคืนสต็อกแบบ atomic

---

## Stock Intake (V1)

Stock Intake คือการบันทึกการซื้อวัตถุดิบเข้าสต็อก

- เลือกวัตถุดิบ จำนวน หน่วยซื้อ ต้นทุนรวม
- ระบบแปลงหน่วยซื้อเป็นหน่วยฐานอัตโนมัติตาม conversion factor
- รองรับวัตถุดิบที่มี/ไม่มีวันหมดอายุ (perishable flag + expiry date)

### Stock Intake Payment Default

เมื่อสร้าง Stock Intake สำเร็จ:

- `payment_status` ถูกตั้งเป็น `paid` โดย default (ฝั่ง server)
- `paid_at` ถูก populate โดย server-side logic
- ไม่ขึ้นกับว่ามี Purchase Receipt แนบหรือไม่

กฎนี้เป็นการตัดความซับซ้อนในการดำเนินงานช่วงแรกของ V1 ไม่ใช่การเชื่อมโยงระหว่าง receipt กับ payment status

---

## Purchase Receipt (V1)

Purchase Receipt คือหลักฐานการซื้อ (procurement evidence) สำหรับ Stock Intake เป็นข้อมูลภายในร้าน ไม่ใช่ฟังก์ชันสลิปการชำระเงินของลูกค้า

- แนบใบเสร็จได้หรือไม่ได้ (optional)
- จัดเก็บใน private Supabase Storage bucket: `purchase-receipts`
- อัปโหลดผ่าน Backend เท่านั้น — frontend ไม่ได้เขียนตรงไปยัง Storage
- canonical durable reference: `receipt_storage_path`
- การดูใบเสร็จใช้ short-lived signed URL ที่สร้างตามคำขอ (on demand)
- signed URL ไม่ถูกเก็บเป็นข้อมูลถาวร
- ผู้มีสิทธิ์สามารถดู/แทนที่/ลบใบเสร็จได้
- การลบ/แทนที่ใบเสร็จไม่เปลี่ยนจำนวนสต็อก มูลค่าการซื้อ หรือ payment status

---

## Waste Recording (V1)

Waste คือการบันทึกการทิ้งสต็อกสำหรับวัตถุดิบที่มีสต็อกคงเหลือ

### สิทธิ์การใช้งาน
- Owner / Manager เท่านั้น

### เกณฑ์การทิ้ง
- สามารถบันทึก Waste สำหรับวัตถุดิบใดก็ได้ที่มีสต็อกคงเหลือ
- ไม่จำกัดเฉพาะของหมดอายุ หรือวัตถุดิบที่มี expiry_date
- `waste_quantity > 0` และ `waste_quantity <= available stock`

### เหตุผลที่รองรับ (reason values)
- `expired` — หมดอายุ
- `damaged` — เสียหาย/ชำรุด
- `spill` — หกหล่น/เสียระหว่างชง
- `quality_issue` — คุณภาพไม่ผ่าน
- `manual_adjustment` — ปรับยอดสต็อกเอง (เช็คสต็อก)
- `other` — อื่น ๆ

### ผลกระทบของ Waste
- บันทึกการทิ้ง + ตัดสต็อกผ่าน canonical stock mutation
- รักษา non-negative inventory
- มีส่วนใน waste-summary และ Owner Dashboard Waste Cost
- ไม่เปลี่ยน payment status ของ Stock Intake
- ไม่เปลี่ยน Purchase Receipt
- ไม่แก้ไขประวัติ Stock Intake ดั้งเดิม

---

## Expiry vs Waste

Expiry monitoring และ Waste recording เป็นฟีเจอร์ที่เกี่ยวข้องกันแต่แยกจากกัน:

- **Expiry alerts** มีประโยชน์สำหรับ monitoring ใกล้หมดอายุ และระบุสต็อกที่หมดอายุแล้ว
- **Waste recording** ใช้บันทึกการทิ้งจริง ไม่จำกัดเฉพาะของหมดอายุ
- expiry ไม่ใช่เงื่อนไขกำหนด (gate) สำหรับการบันทึก Waste

---

## Owner Features

### Dashboard

**Route:** `/owner/dashboard`

Owner Dashboard แสดง:
- ยอดขาย/รายได้ (sales / revenue metrics)
- การ์ดสถานะออเดอร์ระดับสูง (high-level order status cards)
- ต้นทุน/กำไรออเดอร์ที่เกี่ยวข้อง
- ต้นทุนจัดซื้อและความสูญเสีย (Procurement & Waste Analytics)
- ลิงก์ไปยัง Profit Planning

### Procurement & Waste Analytics

แผง `ต้นทุนจัดซื้อและความสูญเสีย` แทนที่แผงรายละเอียดสถานะออเดอร์เดิม (การ์ดสรุปสถานะออเดอร์ระดับสูงยังคงอยู่)

ตัวชี้วัด:
- **มูลค่าซื้อเข้าสต็อก (Purchase Cost)** — มูลค่าการจัดซื้อจาก Stock Intake จริง
- **ชำระแล้ว (Paid Purchase)** — มูลค่าซื้อที่ payment_status = paid
- **ค้างชำระ (Unpaid Purchase)** — มูลค่าซื้อที่ payment_status = unpaid
- **ต้นทุนสูญเสีย (Waste Cost)** — มูลค่า Waste ที่บันทึกตาม canonical
- **อัตราความสูญเสีย (Waste Rate)** — waste cost / purchase cost × 100 (มี safe zero handling)

Purchase Cost ไม่ใช่ Order Cost หรือ COGS — เป็นคนละแนวคิดกัน

### Profit Planning

**Route:** `/owner/profit-planning` (Owner-only)

Profit Planning เป็นฟีเจอร์ช่วยตัดสินใจ (decision-support) ประกอบด้วย:

1. **Planning Baseline** — ข้อมูลพื้นฐานจากระบบ (ต้นทุน ราคา สูตร)
2. **Planning Assumptions** สมมติฐานการวางแผน (ยอดขายเป้าหมาย จำนวนแก้ว/วัน ราคาเฉลี่ย)
3. **Scenario / Projection** — จำลองสถานการณ์เพื่อดูผลลัพธ์แบบ what-if

Profit Planning ใช้ข้อมูลการดำเนินงานจริงในการสนับสนุนการวางแผนกำไร

Profit Planning **ไม่ใช่**:
- ระบบบัญชีที่ผ่านการสอบบัญชี
- รายงานภาษี
- งบการเงินที่รับรอง
- "กำไรจริง" ตามบัญชี — ผลลัพธ์เป็นการคาดการณ์ตามสมมติฐานที่ผู้ใช้ตั้ง

Legacy route `/app/planning` ยังคง redirect ไปยัง `/owner/profit-planning`

---

## Roles

- **Owner:** เห็นข้อมูลวางแผนกำไร ต้นทุน สมมติฐาน รายงาน การ์ดสรุปสถานะออเดอร์ ต้นทุนจัดซื้อ/สูญเสีย และสามารถยกเลิกออเดอร์ในสถานะที่กำหนด
- **Manager:** เห็นข้อมูลการดำเนินงานของร้าน ไม่สามารถยกเลิกออเดอร์ได้
- **Staff:** จัดการออเดอร์และรับชำระเงินที่เคาน์เตอร์ ไม่เห็นข้อมูลต้นทุน กำไร หรือค่าใช้จ่ายแฝง
- **Customer:** ใช้งานเฉพาะหน้าสั่งซื้อและติดตามสถานะผ่าน public token ไม่เห็นข้อมูลภายในร้าน

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS + Radix/shadcn UI |
| Frontend testing | Vitest + React Testing Library |
| Backend | FastAPI (Python) |
| Database / Auth / Storage | Supabase (PostgreSQL) |
| Frontend Hosting | Vercel |
| Backend Hosting | Railway |

---

## Tech Stack

**Frontend:**
- React + TypeScript
- Vite
- Tailwind CSS
- Radix UI / shadcn-style components
- Supabase JS
- Vitest

**Backend:**
- FastAPI (Python)
- Supabase (PostgreSQL)

**Infrastructure:**
- Vercel (frontend)
- Railway (backend)
- Supabase (database, auth, storage)

**V1 ไม่ได้ใช้:**
- LINE OA ในกระบวนการสั่งซื้อของลูกค้า
- Payment gateway ออนไลน์
- Dynamic PromptPay QR generation
- Slip verification
- Automated bank verification

---

## Storage

| Bucket | ประเภท | การใช้งาน |
|---|---|---|
| `menu-images` | public | รูปเมนูสาธารณะ |
| `purchase-receipts` | private | หลักฐานการซื้อ (procurement evidence) สำหรับ Stock Intake |
| `store-payment-assets` | private | ทรัพย์สินการชำระของร้าน (เช่น static QR) |
| `payment-slips` | private | legacy / ไม่ใช่ canonical customer flow ใน V1 |

---

## Realtime

- **REST API** เป็น source of truth
- **Polling** ทุก 15 วินาที (fallback refresh)
- **Realtime** เป็น optional invalidation accelerator — เมื่อมีการเปลี่ยนแปลงในฐานข้อมูล ระบบจะแจ้งให้ frontend ไป refetch REST API
- Production default: `VITE_ENABLE_STORE_ORDERS_REALTIME=false`
- ไม่ได้เปิดใช้ Realtime ใน Production โดย default

---

## Stock / Order Safety

- self-order ไม่ตัด/จองสต็อกตอนส่งออเดอร์
- ตัดสต็อกหลัง Staff ยืนยันชำระเงินเท่านั้น
- Kiosk atomic checkout/finalize เป็น server-authoritative
- การยกเลิกออเดอร์ที่ชำระแล้วคืนสต็อกแบบ atomic
- Waste เป็น flow การสูญเสียสต็อกแยกต่างหาก
- Purchase Receipt ไม่เปลี่ยนแปลงสต็อก

---

## Environment Variables

### Backend

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DEFAULT_STORE_ID

MENU_IMAGE_BUCKET
PURCHASE_RECEIPT_BUCKET
PURCHASE_RECEIPT_MAX_MB
STORE_PAYMENT_ASSET_BUCKET
STORE_PAYMENT_QR_MAX_MB
```

### Frontend

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_BACKEND_URL
VITE_ENABLE_STORE_ORDERS_REALTIME
VITE_SHOW_E2E_HINTS
VITE_ENABLE_MANUAL_LINE_BINDING
VITE_ALLOW_DEMO_DATA_RESET
```

> Purchase Receipt storage ควบคุมฝั่ง server เท่านั้น — ไม่มี `VITE_PURCHASE_RECEIPT_BUCKET`

---

## Local Development

เตรียม Node.js v18+, npm, Python 3.10+, และ Supabase credentials ก่อนเริ่ม

### Backend

```bash
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
# http://127.0.0.1:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite อาจเลือก port อื่นถ้า port default ถูกใช้แล้ว (เช่น `5174` แทน `5173`) — ดู URL ที่ Vite แสดงใน terminal

---

## Route Families

| Family | Routes |
|---|---|
| Customer | `/order`, `/order/:productId`, `/order/cart`, `/order/confirm`, `/order/success`, `/order/status` |
| Staff | `/staff/kiosk`, `/staff/orders`, `/staff/orders/:id`, `/staff/customers` |
| Owner | `/owner/dashboard`, `/owner/profit-planning`, `/owner/reports`, `/owner/menus`, `/owner/recipes`, `/owner/cost-items`, `/owner/payment-settings` |
| System | `/system`, `/system/users`, `/system/roles`, `/system/health`, `/system/audit-logs` |

Legacy routes (`/admin/*`, `/app/*`, `/liff/*`, `/store-admin/*`) ยังคง redirect ไปยัง canonical routes

---

## Testing

### Frontend (หลัง dropdown patch)

| Metric | Result |
|---|---|
| Tests | 947 passed / 0 failed |
| Test files | 60 passed |
| Build | PASS |
| TypeScript | 0 errors |
| ESLint | 0 errors / 23 warnings (baseline) |

### Backend (safe regression ก่อน dropdown-only patch)

| Metric | Result |
|---|---|
| Tests | 569 passed / 0 failed |

### Integration DB suite

ไม่ได้รันเมื่อ isolated Docker PostgreSQL ท `localhost:5433` ไม่พร้อมใช้งาน — ไม่ถือว่า integration suite ผ่าน

---

## Privacy / PDPA

ข้อมูลลูกค้า canonical ใน V1:
- `customer_name` (จำเป็น)
- `note` (หมายเหตุ — ไม่บังคับ)
- ข้อมูลออเดอร์ สถานะ สถานะการชำระ และ timestamps

V1 ไม่ได้เก็บจากลูกค้า:
- เบอร์โทรศัพท์, อีเมล, LINE ID
- เวลารับสินค้า (pickup time)
- สลิปการชำระเงิน
- ข้อมูลบัตร/บัญชีธนาคาร

ไม่ได้กำหนด retention period ที่ตายตัว และไม่มี DPO ที่ระบุเฉพาะ

---

## Release Status

- **Frontend V1 frozen tag:** `healholic-frontend-v1` @ `2595a528690ca9b23e2e430b858f79a464312fa5`
- **Backend freeze tags:** `healholic-backend-v1` / `healholic-backend-v1.1`
- Branch `Healholic-graphic` ปัจจุบันมี post-V1 commits เพิ่มเติมจาก frozen tag
- Tag ดั้งเดิมยังคงอยู่ที่จุด V1 release ไม่ถูกย้าย

---

## Recent Post-V1 Improvements

- **Counter payment async cleanup stabilization** — ทำให้ counter payment regression suite เสถียรขึ้น
- **Backend dev/test psycopg2 dependency** — คืน dependency ที่จำเป็นสำหรับ dev/test
- **Purchase Receipt lifecycle** — หลักฐานการซื้อแบบ private storage, signed URL on demand, ดู/แทนที่/ลบได้
- **Stock Intake default-paid simplification** — Stock Intake ใหม่ถูกตั้ง paid โดย server-side default
- **Owner Procurement & Waste Analytics** — แผงต้นทุนจัดซื้อและความสูญเสียบน Dashboard
- **General Waste Recording** — บันทึก Waste สำหรับวัตถุดิบที่มีสต็อก ไม่จำกัดเฉพาะของหมดอายุ
- **Global Dropdown UX standardization** — dropdown ที่ใช้งานจริงใช้ shared Select component ที่เปิดด้านล่าง, มี bounded scrolling, และ keyboard accessible

---

## Known Deferred Operational QA

บางกรณี Production manual QA ต้องการธุรกรรมจริง เช่น:
- การซื้อเข้าสต็อกจริง (Stock Intake)
- ใบเสร็จการซื้อจริง (Purchase Receipt)
- การบันทึก Waste จริง
- การกระทบยอด Dashboard จริง

การทดสอบอัตโนมัติครอบคลุมพฤติกรรมทางธุรกิจ แต่การทดสอบ manual ใน Production ยังคงจำเป็นสำหรับบางกรณี

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

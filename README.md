# 💎 Valora Hub — Restaurant Intelligence Platform

**Valora Hub** เป็นเครื่องมือวิเคราะห์ต้นทุนและจำลองสถานการณ์การดำเนินงาน ออกแบบมาเพื่อเจ้าของร้านอาหารและคาเฟ่ในไทยโดยเฉพาะ เพื่อช่วยในการตัดสินใจทางธุรกิจด้วยข้อมูลที่แม่นยำ

![Valora Hub Preview](public/favicon.svg) <!-- หรือใส่ภาพ Hero Screenshot ถ้ามี -->

## 🚀 คุณสมบัติเด่น (Core Features)

- **Financial Dashboard**: ติดตามยอดขาย ต้นทุนวัตถุดิบ (COGS) และกำไรสุทธิแบบ Real-time
- **Scenario Simulation**: จำลองสถานการณ์ "What-if" เพื่อดูผลกระทบของการเปลี่ยนแปลงราคาอาหาร หรือการเพิ่มค่าใช้จ่ายพนักงาน
- **Premium Services**: ระบบสมัครสมาชิกเพื่อเข้าถึงฟีเจอร์ขั้นสูงและการขอคำปรึกษาจากทีมผู้เชี่ยวชาญ
- **Admin Management**: ระบบหลังบ้านสำหรับจัดการคำขอรับคำปรึกษาและตรวจสอบสถานะการชำระเงิน
- **Thai Context**: ออกแบบการคำนวณและคำศัพท์ให้สอดคล้องกับการทำธุรกิจร้านอาหารในประเทศไทย

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

- **Frontend**: [Vite](https://vitejs.dev/) + [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Database / Auth**: [Supabase](https://supabase.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Payment Gateway**: [Omise](https://www.omise.co/) (Coming Soon)

## 📦 วิธีการประติติดตั้ง (Local Development)

### 1. Pre-requisites

- Node.js (v18 หรือสูงกว่า)
- npm หรือ Bun

### 2. การติดตั้ง

```bash
# Clone repository
git clone https://github.com/Pongsath0n/valora-prototype-hub.git

# เข้าไปที่โฟลเดอร์
cd valora-prototype-hub

# ติดตั้ง dependencies
npm install
```

### 3. การตั้งค่า Environment Variables

สร้างไฟล์ `.env` ที่ Root directory และระบุค่าดังนี้:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_LIFF_ENABLED=false
VITE_LIFF_ID=your_liff_id
VITE_LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
```

_(ดูตัวอย่างได้จากไฟล์ `.env.example`)_

### 4. รันโปรเจกต์

```bash
npm run dev
```

## 🌐 การ Deploy (Deployment)

โปรเจกต์นี้รองรับการ Deploy บน **Vercel** อย่างเต็มรูปแบบ:

1. เชื่อมต่อ GitHub Repo เข้ากับ Vercel
2. ตั้งค่า Environment Variables ใน Vercel Dashboard
3. ระบบจะทำการ Deploy อัตโนมัติทุกครั้งที่มีการ Push ไปยัง `main` branch

---

## 📄 License

Copyright © 2026 Valora Hub. All rights reserved.


## LINE LIFF Environment

- `VITE_LIFF_ENABLED`: set `true` to enable real LIFF runtime.
- `VITE_LIFF_ID`: LIFF app ID from LINE Developers.
- `VITE_LINE_CHANNEL_ACCESS_TOKEN`: Messaging API token (for server-side confirmation messaging integration).

When LIFF is disabled or not configured, Valora uses mock LINE profile data for development.


## Supabase RLS policy (profiles)

If `/admin` shows `Access Denied` even for valid roles, ensure `profiles` allows users to read their own row (`profiles.id = auth.uid()`).

```sql
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());
```

## Supabase Storage setup (menu-images)

If image upload fails because bucket is missing, create the bucket manually in Supabase Dashboard:

1. Storage → New bucket
2. Bucket name: `menu-images`
3. Public bucket: enabled (for public image URL)

Then verify storage policies allow authenticated upload and public read as needed by your project security model.


## Phase 1 Transaction API (FastAPI)

Valora Phase 1 now includes a **FastAPI transaction layer** so LIFF / Admin clients do not write directly to Supabase transaction tables.

### Backend setup (confirmed)

```bash
cd backend
pip install -r requirements.txt
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export DEFAULT_STORE_ID=348544d2-9a2c-4ba4-8875-bc106fed752e
uvicorn app.main:app --reload --port 8000
```

Or from repository root:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

### Frontend setup

```env
VITE_API_BASE_URL=http://localhost:8000
```

- LIFF order flow uses Phase 1 endpoints under `/api/*`.
- Admin order/payment workflows also use `/api/*` endpoints.
- `backend_app.py` is deprecated and must not be used.

## Valora Phase 1 Documentation

### 1) Architecture Overview

```text
LINE OA / Rich Menu
→ LIFF POS
→ FastAPI REST API
→ Supabase Database + Storage
→ Admin Dashboard
→ LINE Messaging API
→ Customer LINE
```

- LIFF POS และ Admin Dashboard ต้องเรียกผ่าน FastAPI เป็น transaction layer หลักใน Phase 1
- Frontend ไม่ควรเขียน transaction tables โดยตรง

### 2) Environment Variables

> Backend (`backend/.env`)

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_STORE_ID=348544d2-9a2c-4ba4-8875-bc106fed752e
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

> Frontend (`.env`)

```env
LIFF_ID=
API_BASE_URL=http://localhost:8000
```

> หมายเหตุ implementation ปัจจุบันอาจใช้ prefix `VITE_` / `NEXT_PUBLIC_` ใน frontend build env ตาม framework

### 3) Confirmed Database Naming (Source of Truth)

- `orders.order_status` คือสถานะออเดอร์หลัก
- `orders.status` คือ legacy field ที่ sync ตาม `order_status`
- `orders.payment_status` คือสรุปสถานะการชำระเงินระดับออเดอร์
- `payments.status` คือสถานะรีวิวการชำระเงินจริง
- `payments.method` คือวิธีการชำระเงิน
- `order_items.quantity` คือจำนวน
- `order_items.total_price` คือยอดรวมต่อรายการ
- `order_items.total_cost` คือต้นทุนรวมต่อรายการ
- `order_items.line_profit` คือกำไรต่อรายการ

### 4) Manual API Test Flow

1. Create/Update LINE customer (`POST /api/customers/line`)
2. Create order (`POST /api/orders`)
3. Add order item (`POST /api/orders/{order_id}/items`)
4. Create/upload payment slip (`POST /api/payments/upload-slip`)
5. Approve payment (`PATCH /api/payments/{payment_id}/approve`)
6. Verify order accepted (`GET /api/orders/{order_id}`)
7. Mark preparing (`PATCH /api/orders/{order_id}/status` = `preparing`)
8. Mark ready (`PATCH /api/orders/{order_id}/status` = `ready`)
9. Verify notification log (`line_notification_logs`)

ดูตัวอย่างคำสั่งละเอียดที่ `docs/phase1-api-test.md`

### 5) LIFF POS Test Flow

1. เปิด LIFF app จาก LINE OA Rich Menu
2. ระบบอ่าน LINE profile และสร้าง/อัปเดต customer
3. ลูกค้าเลือกเมนู
4. ระบบสร้าง order + order items ผ่าน API
5. ลูกค้าอัปโหลดสลิป
6. ตรวจสอบสถานะเป็น `waiting_payment_review`

### 6) Admin Dashboard Test Flow

1. เปิด Payment Review Queue
2. Approve slip
3. Reject slip (พร้อมเหตุผล)
4. Mark preparing
5. Mark ready
6. Mark completed
7. Cancel order (พร้อมเหตุผล)

### 7) End-to-End Test Checklist

- [ ] ลูกค้าสั่งออเดอร์จาก LIFF ได้
- [ ] ออเดอร์แสดงใน Admin Dashboard
- [ ] สลิปแสดงใน Payment Review Queue
- [ ] Admin กด approve slip ได้
- [ ] ออเดอร์เปลี่ยนเป็น `accepted`
- [ ] Admin กด mark ready ได้
- [ ] ระบบพยายามส่ง LINE notification
- [ ] Sales / Cost / Profit ถูกต้อง
- [ ] Logs ถูกสร้างครบ (order/payment/line)

### 8) Out of Scope (Phase 1)

- MCP
- Auto slip verification API
- Payment gateway
- Coupon/points
- Delivery platform integration
- Advanced stock deduction
- Multi-branch advanced routing

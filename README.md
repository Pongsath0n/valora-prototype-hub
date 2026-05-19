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

### Backend setup

```bash
pip install -r backend_requirements.txt
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
uvicorn backend_app:app --reload --port 8000
```

### Frontend setup

```env
VITE_TRANSACTION_API_URL=http://localhost:8000
```

- LIFF order submit now posts to `POST /v1/orders/line-oa` (order_type=`manual`, channel=`line_oa`, pickup_type=`pickup`).
- Admin approval flow endpoint is `POST /v1/admin/payments/{payment_id}/approve`.

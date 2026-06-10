# 💎 Valora Hub — Restaurant Intelligence Platform

**Valora Hub** เป็นเครื่องมือวิเคราะห์ต้นทุนและจำลองสถานการณ์การดำเนินงาน ออกแบบมาเพื่อเจ้าของร้านอาหารและคาเฟ่ในไทยโดยเฉพาะ เพื่อช่วยในการตัดสินใจทางธุรกิจด้วยข้อมูลที่แม่นยำ

![Valora Hub Preview](frontend/public/favicon.svg)

## 📦 Monorepo layout

- `frontend/` — Vite + React + TypeScript UI (รวม `/system` และ `/store-admin` views)
- `backend/` — FastAPI service และ health endpoints
- `database/` — Supabase schema / seed SQL (ไม่มีการปรับ schema ใหม่ใน PR นี้)
- `docs/` — เอกสารประกอบ
- `scripts/` — สคริปต์ช่วยงาน (เช่น seed owner user)

## 🚀 คุณสมบัติเด่น (Core Features)

- **Financial Dashboard**: ติดตามยอดขาย ต้นทุนวัตถุดิบ (COGS) และกำไรสุทธิแบบ Real-time
- **Scenario Simulation**: จำลองสถานการณ์ "What-if" เพื่อดูผลกระทบของการเปลี่ยนแปลงราคาอาหาร หรือการเพิ่มค่าใช้จ่ายพนักงาน
- **Premium Services**: ระบบสมัครสมาชิกเพื่อเข้าถึงฟีเจอร์ขั้นสูงและการขอคำปรึกษาจากทีมผู้เชี่ยวชาญ
- **Admin Management**: ระบบหลังบ้านสำหรับจัดการคำขอรับคำปรึกษาและตรวจสอบสถานะการชำระเงิน
- **Thai Context**: ออกแบบการคำนวณและคำศัพท์ให้สอดคล้องกับการทำธุรกิจร้านอาหารในประเทศไทย

## 🛠️ Tech Stack

- **Frontend**: [Vite](https://vitejs.dev/) + [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/)
- **Database / Auth**: [Supabase](https://supabase.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🧑‍� Local Development

### 1) Prerequisites

- Node.js v18+ และ npm (สำหรับ frontend)
- Python 3.10+ (สำหรับ backend)
- Supabase project credentials ถ้าต้องการทดสอบ auth/db health checks หรือ seed script

### 2) Frontend (Vite + React)

```bash
cd frontend
npm install

# ตั้งค่า environment
# สร้างไฟล์ frontend/.env ด้วยค่าตัวอย่าง:
# VITE_SUPABASE_URL=your_supabase_url
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# VITE_LIFF_ENABLED=false
# VITE_LIFF_ID=your_liff_id
# VITE_LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
# VITE_ALLOW_DEMO_DATA_RESET=false  # เปิดเป็น true เฉพาะ dev/QA ที่ต้องรีเซ็ต local demo data
# VITE_SHOW_E2E_HINTS=false         # เปิด banner เตือน flow ทดสอบเฉพาะ QA/Dev
# VITE_ENABLE_MANUAL_LINE_BINDING=false # เปิดปุ่มผูก LINE แบบ manual สำหรับการทดสอบเท่านั้น

npm run dev  # http://localhost:8080
```

### 3) Backend (FastAPI)

```bash
cd backend
python -m venv .venv
./.venv/Scripts/Activate.ps1  # หรือ source .venv/bin/activate บน macOS/Linux
pip install -r requirements.txt

# คัดลอก .env.example เป็น .env และตั้งค่า
# SUPABASE_URL
# SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4) Database assets

- Active schema reference: `database/supabase.sql`
- Legacy schema references are archived in `database/archive/`
- ใช้ `database/supabase.sql` เป็น source of truth เพียงไฟล์เดียว

### 5) Utility scripts

- `scripts/seed-owner-user.mjs` ใช้สำหรับ seed owner profile (ต้องตั้งค่า `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_PASSWORD`, และ `OWNER_EMAIL` ถ้าต้องการ)

## 🌐 Deployment

- Frontend สามารถ deploy จากโฟลเดอร์ `frontend/` (เช่น Vercel หรือ static hosting)
- Backend รันผ่าน `uvicorn app.main:app` จากโฟลเดอร์ `backend/` (เพิ่ม process manager / container orchestration ตามสภาพแวดล้อม)

## 📄 License

Copyright © 2026 Valora Hub. All rights reserved.

## LINE LIFF Environment

- `VITE_LIFF_ENABLED`: set `true` to enable real LIFF runtime.
- `VITE_LIFF_ID`: LIFF app ID from LINE Developers.
- `VITE_LINE_CHANNEL_ACCESS_TOKEN`: Messaging API token (for server-side confirmation messaging integration).

เมื่อปิด LIFF หรือยังไม่ตั้งค่า Valora จะใช้ mock LINE profile data สำหรับ development

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

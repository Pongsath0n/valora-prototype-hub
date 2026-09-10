Healholic — Valora V1 สำหรับระบบหน้าร้านและการวางแผนกำไร

สถานะปัจจุบัน: Frontend V1 Frozen / พร้อม Redeploy สู่ Production และเข้าสู่ช่วง Soft Launch

Healholic เป็น implementation ของแพลตฟอร์ม Valora สำหรับร้านขนาดเล็ก โดยรวมการรับออเดอร์ การทำงานหน้าร้าน การจัดการคิว การชำระเงินที่เคาน์เตอร์ และเครื่องมือวางแผนกำไรสำหรับ Owner ไว้ในระบบเดียว

Valora มีจุดยืนเป็น decision-support platform สำหรับร้านเล็กและ SMEs ไม่ใช่ ERP หรือระบบบัญชีเต็มรูปแบบ โดยเน้นให้เจ้าของร้านเห็นข้อมูลที่จำเป็นต่อการวางแผนต้นทุน กำไร และการดำเนินงานโดยไม่เพิ่มความซับซ้อนเกินความจำเป็น

ภาพรวมของระบบ

Healholic V1 เชื่อม flow หลักของร้านตั้งแต่ลูกค้าสั่งสินค้าไปจนถึง Staff จัดการคิวและ Owner ใช้ข้อมูลสำหรับวางแผนธุรกิจ

ภาพรวมการทำงาน:

Customer
  ↓
Public Order
  ↓
Incoming Queue
  ↓
Counter Payment
  ↓
Production Queue
  ↓
Preparing → Ready → Completed

Owner
  ↓
Profit Planning
  ↓
Planning Baseline
  ↓
Planning Assumptions
  ↓
Scenario / Projection

ระบบถูกออกแบบให้ Kiosk เป็นหน้าปฏิบัติงานหลักของ Staff และให้ /staff/orders เป็นหน้าจัดการ Incoming และ Production Queue แบบเต็ม

จุดยืนของระบบ

Profit Planning เป็นหนึ่งในความสามารถหลักของ Valora สำหรับ Owner

ข้อมูลการขาย สูตรสินค้า ต้นทุนวัตถุดิบ และค่าใช้จ่ายที่เกี่ยวข้องถูกนำมาใช้สนับสนุนการวางแผน

ระบบแยกชัดเจนระหว่าง ข้อมูลที่เกิดขึ้นจริง, สมมติฐานการวางแผน, และ Scenario แบบ What-if

Customer, Staff, Manager และ Owner มีสิทธิ์และหน้าที่ต่างกันตาม Store Role

ระบบไม่ถือว่า Platform Admin เท่ากับ Store Owner

V1 เน้นความเรียบง่าย ความปลอดภัย และ workflow ที่เหมาะกับการใช้งานจริงหน้าร้าน

สิ่งที่ Healholic / Valora V1 ทำได้

Customer Order

ลูกค้าดูเมนูผ่านหน้าเว็บสาธารณะ /order

ค้นหาและกรองเมนูตามหมวดหมู่

เลือกสินค้า ตัวเลือก และ Add-on ที่ระบบอนุญาต

เพิ่มสินค้าใน Cart และตรวจสอบรายการก่อนส่ง

ระบุ ชื่อลูกค้า และ หมายเหตุระดับออเดอร์ เท่านั้น

ส่ง Self-order เข้าสู่ Incoming Queue

ติดตามสถานะออเดอร์ด้วย Public Token

แสดงเลขออเดอร์รูปแบบ ORD-XXXXX

V1 ไม่มี Customer-side flow สำหรับ:

อัปโหลดสลิป

เลือก Payment Gateway

ชำระเงินออนไลน์

LINE identity

เบอร์โทรศัพท์

Pickup time

Email

Staff Kiosk

หน้า /staff/kiosk เป็น operation surface หลักสำหรับ Staff

รองรับ:

เลือกเมนูสำหรับ Walk-in

ปรับตัวเลือกและจำนวนสินค้า

จัดการ Kiosk Cart

เลือกชำระเงินที่เคาน์เตอร์ด้วย:

เงินสด

PromptPay QR แบบ Static ของร้าน

แสดง QR ขนาดเหมาะกับการใช้งานบน iPad

มี image lifecycle และ retry สำหรับ Safari/iPad

แสดง Incoming Self-order ที่รอชำระโดยไม่รบกวน Kiosk operation มากเกินไป

Preview Incoming สูงสุด 3 รายการ

แสดงจำนวนคิวรวมและเวลารอของออเดอร์เก่าสุด

เปิดดูคิวทั้งหมดผ่าน /staff/orders

Self-order ที่เข้ามาจะ ไม่ถูก copy เข้า Kiosk Cart

Incoming Queue

Incoming Queue ใช้สำหรับ Self-order ที่:

status = pending_payment
payment_status = unpaid
source = web_order

หลักการสำคัญ:

Backend เป็นผู้กำหนดลำดับ FIFO

Staff เห็นชื่อลูกค้า หมายเหตุ รายการสินค้า ยอดรวม และเวลารอ

ไม่มีขั้นตอน “รับออเดอร์” เพิ่ม เพราะการอยู่ใน Incoming Queue หมายถึงระบบรับรายการแล้ว

Staff เปิด Counter Payment Dialog เพื่อรับชำระที่หน้าร้าน

รองรับเงินสดและ Static PromptPay เท่านั้นใน V1

Production Queue

เมื่อ Staff ยืนยันว่ารับชำระเงินแล้ว ออเดอร์จะเข้าสู่ Production Queue

Flow หลัก:

accepted
  ↓
preparing
  ↓
ready
  ↓
completed

Production Queue ใช้ payment_confirmed_at เป็นลำดับ FIFO และไม่มีการให้ priority ตาม source ของออเดอร์

การยืนยันชำระเงินใช้ Backend atomic flow เพื่อให้การสร้าง/ยืนยันออเดอร์ การบันทึกการชำระ และการตัด Stock ทำงานสอดคล้องกัน

Cancellation

การยกเลิกออเดอร์เป็นสิทธิ์ Store Owner เท่านั้น

Owner สามารถเห็นคำสั่งยกเลิกเฉพาะสถานะ:

pending_payment

accepted

ไม่อนุญาตผ่าน normal cancel flow สำหรับ:

preparing

ready

completed

cancelled

voided

Staff, Manager และ Platform Admin ที่ไม่ได้มี currentStoreRole = owner จะไม่เห็น action ยกเลิก

Profit Planning

หน้า Owner:

/owner/profit-planning

ใช้สำหรับช่วย Owner วางแผนกำไรและประเมินผลของสมมติฐานก่อนตัดสินใจ

ระบบแยกข้อมูลออกเป็น 3 แนวคิดหลัก:

1. Planning Baseline

ข้อมูลฐานจาก Backend ที่ใช้เป็นจุดตั้งต้นในการวางแผน เช่น โครงสร้างสินค้า สูตร และข้อมูลที่เกี่ยวข้องกับการคำนวณ

2. Planning Assumptions

สมมติฐานที่ Owner ใช้วางแผน เช่น:

เป้ากำไรรายเดือน

จำนวนวันที่เปิดร้าน

จำนวนแก้วหรือยอดขายที่คาดหวัง

ค่าใช้จ่ายประจำ

สมมติฐานอื่นที่เกี่ยวข้องกับแผน

ค่ากลุ่มนี้เป็น Planning Assumptions ไม่ใช่ผลกำไรจริงทางบัญชี

3. Scenario / Projection

Owner สามารถทดลองปรับสมมติฐานเพื่อดูผลในรูปแบบ What-if โดยไม่เปลี่ยนความหมายของข้อมูลจริง

ตัวอย่างสิ่งที่ใช้ประกอบการวางแผน:

ต้นทุนวัตถุดิบตามสูตร

Direct cost

ค่าใช้จ่ายประจำ

กำไรขั้นต้นต่อสินค้า

Break-even

เป้ากำไร

จำนวนยอดขายที่ต้องทำเพื่อให้ถึงเป้าหมาย

Profit Planning เป็นเครื่องมือช่วยตัดสินใจ ไม่ใช่งบการเงินหรือระบบบัญชีรับรองผลประกอบการ

บทบาทผู้ใช้งาน

Role

สิทธิ์หลัก

Customer

สั่งสินค้าและติดตามสถานะ

Staff

Kiosk, Incoming Queue, Counter Payment, Production operation

Manager

งาน operation ตามสิทธิ์ร้าน แต่ไม่มี Owner-only cancellation

Owner

Operation + Profit Planning + Owner-only actions

Platform/System Admin

ดูแลระบบระดับแพลตฟอร์ม ไม่ได้รับสิทธิ์ Store Owner โดยอัตโนมัติ

ระบบใช้ Store Role (currentStoreRole) เป็น authority สำหรับ Owner-only features

Route หลัก

Customer

/order
/order/:productId
/order/cart
/order/confirm
/order/success
/order/status

Staff

/staff/kiosk
/staff/orders
/staff/orders/:id

Owner

/owner/profit-planning

System

/system/*

Legacy /liff/* routes บางส่วนยังคง redirect ไปยัง canonical /order/* routes เพื่อรองรับ compatibility

Realtime

Frontend มี Realtime invalidation mechanism สำหรับ Store Orders แต่ V1 ใช้:

Canonical REST API = Source of Truth
Polling 15 วินาที = Fallback Refresh
Realtime = Optional Invalidation Accelerator

Production feature flag ยังคงต้องเป็น:

VITE_ENABLE_STORE_ORDERS_REALTIME=false

จนกว่าจะผ่านการตรวจสอบ RLS และ Supabase Realtime publication infrastructure แยกต่างหาก

สิ่งที่ Healholic / Valora V1 ยังไม่ใช่

ไม่ใช่ ERP เต็มรูปแบบ

ไม่ใช่ระบบบัญชีครบวงจร

ไม่ใช่ระบบภาษีหรือยื่นแบบอัตโนมัติ

ไม่ใช่ Payroll

ไม่ใช่ Inventory Accounting ระดับองค์กร

ไม่ใช่ CRM เชิงลึก

ไม่ใช่ Payment Gateway

ไม่มีระบบตรวจสลิปอัตโนมัติใน V1

ไม่มี Dynamic PromptPay QR

ไม่มีการตรวจสอบการรับเงินจริงอัตโนมัติ

การชำระเงิน V1 ใช้ Staff เป็นผู้ยืนยันการรับเงินจริงที่เคาน์เตอร์

Tech Stack

Frontend: React 18 + Vite + TypeScript

Routing: React Router

Server State / Query: TanStack Query

Backend: FastAPI

Database / Auth / Storage: Supabase

Database: PostgreSQL

Frontend Deployment: Vercel

Backend Deployment: Railway

การรันระบบสำหรับพัฒนา

Backend

cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Backend local:

http://127.0.0.1:8000

Frontend

cd frontend
npm install
npm run dev

Vite จะแสดง Local URL ที่ใช้งานจริงใน Terminal โดยปกติเริ่มจาก port 5173 และอาจเลือก port ถัดไปหากถูกใช้งานอยู่แล้ว

Validation Commands

Frontend

cd frontend

npm test
npm run build
npx tsc --noEmit
npm run lint

Frontend V1 release validation ล่าสุด:

Tests:       893 passed / 0 failed
Build:       PASS
TypeScript:  0 errors
ESLint:      0 errors / 23 warnings

มี known test-stability observation ใน CounterPaymentDialog ที่เคยเกิด timer teardown flake แบบ intermittent แต่ final validation run ผ่านทั้งหมด

Backend

cd backend

python -m pytest

Backend V1.1 frozen contract ผ่าน regression suite ก่อน freeze และไม่มี Backend source change ใน Frontend V1 release

Release Snapshot

Backend

healholic-backend-v1
healholic-backend-v1.1

Frontend

healholic-frontend-fe01
healholic-frontend-v1

Frontend V1 release commit:

2595a528690ca9b23e2e430b858f79a464312fa5

Tag:

healholic-frontend-v1

Production Safety

ห้าม commit .env หรือ secrets ลง repository

Frontend ใช้ Supabase anon/public key เท่านั้น

ห้ามนำ SUPABASE_SERVICE_ROLE_KEY ไปใช้ใน Frontend

ห้าม hardcode Production secrets ใน source code

Production Database เป็นข้อมูลจริงของร้าน ห้ามสร้าง/แก้ไข/ลบข้อมูลเพื่อ QA โดยไม่จำเป็น

การทดสอบ production ควรเน้น read-only smoke test และหยุดก่อน action ที่ทำ mutation เมื่อไม่มีเหตุผลทางธุรกิจจริง

Realtime ต้องคงเป็น false จนกว่า infrastructure gate จะผ่าน

ก่อน Production deployment ต้องตรวจ VITE_BACKEND_URL, Supabase environment และ release commit ให้ถูกต้อง

สถานะปัจจุบัน

Healholic Frontend V1 ผ่าน:

Frontend integration

Automated regression testing

Manual Smoke Test

iPad Safari PromptPay QR verification

Customer UX validation

Staff Kiosk / Incoming Queue validation

Owner RBAC validation

Worktree cleanup

Frontend V1 freeze

Remote branch/tag verification

สถานะปัจจุบัน:

Frontend V1 Frozen — พร้อม Redeploy สู่ Production และเริ่ม Soft Launch แบบควบคุมคุณภาพ

ในช่วง Soft Launch จะเน้น:

เฝ้าระวัง blocker bug

ตรวจสอบ workflow หน้างานจริง

เก็บ feedback จาก Owner และ Staff

หลีกเลี่ยงการเพิ่ม feature ใหม่โดยไม่ผ่านการวางแผน

ใช้ feedback เป็นข้อมูลสำหรับ V1.x / V2

Contact

สำหรับคำถามหรือข้อสงสัยเกี่ยวกับระบบ:

pongsathon.officialwork@gmail.com

License

Copyright © 2026 Valora Hub. All rights reserved.

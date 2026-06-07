import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const items = [
  {
    value: "manual-slip",
    title: "ร้านตรวจสลิปด้วยตัวเอง",
    body: "ตอนนี้เจ้าของร้านจะเป็นคนกดยืนยันสลิปทุกใบเอง เพื่อให้มั่นใจว่ายอดและบัญชีตรงกับร้านจริง ก่อนเปิดสถานะให้เริ่มเตรียม วิธีนี้เรียบง่าย โปร่งใส และเริ่มใช้ได้ทันทีโดยไม่ต้องพึ่งบริการภายนอก",
  },
  {
    value: "future-api",
    title: "อนาคต: เพิ่มการตรวจสลิปอัตโนมัติได้",
    body: "ระบบออกแบบแยกขั้นตอนรับสลิปออกจากการอนุมัติ ทำให้อนาคตสามารถเพิ่มระบบตรวจสลิปอัตโนมัติได้ โดยไม่ต้องรื้อหน้าจอหรือย้ายข้อมูลใหม่ ร้านยังเลือกได้ว่าจะให้ระบบช่วยกรองก่อน แล้วค่อยตรวจซ้ำอีกทีได้",
  },
  {
    value: "line-notification",
    title: "การแจ้งเตือนผ่าน LINE",
    body: "ขณะนี้การแจ้งเตือนสถานะไปหาลูกค้าผ่าน LINE ยังเป็นโหมดทดสอบ ลูกค้าสามารถติดตามสถานะออเดอร์ได้เองผ่านหน้าเช็กสถานะได้ตลอด ร้านสามารถเปิดใช้งานได้ครบทุกอย่างแม้ยังไม่ได้เปิดการส่ง LINE จริง",
  },
  {
    value: "scope",
    title: "ตอนนี้ระบบทำอะไรได้บ้าง",
    body: "ตอนนี้ Valora เน้นรับออเดอร์ออนไลน์ ตรวจสลิป ติดตามออเดอร์ และดูต้นทุน–กำไรของแต่ละเมนู ส่วนฟีเจอร์ขั้นสูง เช่น การจัดการสต็อกอัตโนมัติ ใบเสร็จภาษี และการเชื่อมต่อระบบบัญชีภายนอก จะทยอยเพิ่มในลำดับถัดไปตามฟีดแบ็กจากร้านจริง",
  },
];

export default function PhaseOneSection() {
  return (
    <section
      id="transparency"
      className="border-t py-20 md:py-24"
      aria-labelledby="phaseone-heading"
    >
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center">
          <p
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-info/30 bg-info/5 px-3 py-1 text-xs font-medium"
            style={{ color: "hsl(var(--info))" }}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            พูดตรงไปตรงมา
          </p>
          <h2
            id="phaseone-heading"
            className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            พูดตรง ๆ ว่าตอนนี้ระบบทำอะไรได้ และอะไรกำลังจะมา
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Valora เลือกออกแบบจากของจริงก่อน ค่อย ๆ ขยายตามฟีดแบ็กของร้าน
          </p>
        </div>

        <div className="mt-10 rounded-2xl border bg-card p-2 sm:p-4 md:p-6">
          <Accordion type="single" collapsible defaultValue="manual-slip" className="w-full">
            {items.map((item) => (
              <AccordionItem key={item.value} value={item.value} className="px-2 sm:px-4">
                <AccordionTrigger className="text-left text-base font-semibold text-foreground hover:no-underline">
                  {item.title}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

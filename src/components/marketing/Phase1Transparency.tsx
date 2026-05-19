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
    title: "Phase 1: ตรวจสลิปด้วยมือ",
    body: "ในเฟสแรก แอดมินจะเป็นคนกดยืนยันสลิปทุกใบเอง เพื่อให้มั่นใจว่ายอดและเลขที่บัญชีตรงกับร้านจริง ๆ ก่อนเปิดสถานะออเดอร์ให้เริ่มเตรียม วิธีนี้เรียบง่าย โปร่งใส และเริ่มใช้ได้ทันทีโดยไม่ต้องเชื่อมต่อบริการตรวจสลิปภายนอก",
  },
  {
    value: "future-api",
    title: "อนาคต: ต่อ API ตรวจสลิปอัตโนมัติได้",
    body: "ระบบออกแบบโฟลว์ payment_request แยกออกจากการอนุมัติ ทำให้สามารถเสียบ API ตรวจสลิปอัตโนมัติเพิ่มในภายหลังได้ โดยไม่ต้องรื้อหน้าจอหรือ migrate ข้อมูลใหม่ แอดมินสามารถเลือกได้ว่าจะใช้ระบบช่วยกรอง แล้วเหลือเคสกึ่งอัตโนมัติให้คนรีวิวอีกที",
  },
  {
    value: "line-notification",
    title: "การแจ้งเตือนผ่าน LINE",
    body: "การแจ้งเตือนสถานะออเดอร์กลับไปหาลูกค้าผ่าน LINE จะทำงานเมื่อร้านได้ตั้งค่า LINE OA และ Channel Access Token เรียบร้อยแล้ว ถ้ายังไม่ได้ตั้งค่า ระบบยังใช้งานครบทุกอย่างได้ตามปกติ เพียงแต่ร้านจะต้องแจ้งสถานะลูกค้าผ่านช่องทางอื่นไปก่อน",
  },
  {
    value: "scope",
    title: "ขอบเขตของ Phase 1",
    body: "เฟสแรกของ Valora เน้น POS + ตรวจสลิป + ติดตามออเดอร์ + ดูต้นทุนและกำไรขั้นต้นจาก order_items ฟีเจอร์ขั้นสูง เช่น การจัดการสต็อกอัตโนมัติ, ใบเสร็จภาษี, integration กับระบบบัญชีภายนอก จะทยอยเพิ่มในเฟสถัดไปตามฟีดแบ็กจากร้านจริง",
  },
];

export default function Phase1Transparency() {
  return (
    <section id="transparency" className="border-t py-20 md:py-24">
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-info/30 bg-info/5 px-3 py-1 text-xs font-medium" style={{ color: "hsl(var(--info))" }}>
            <Info className="h-3.5 w-3.5" />
            ความโปร่งใสของ Phase 1
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
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

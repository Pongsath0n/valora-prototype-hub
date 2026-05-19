import {
  ArrowRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Coffee,
  Package,
  PieChart,
  ShoppingCart,
  Store,
  TrendingUp,
  Workflow,
} from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

const features = [
  ["จัดการเมนู", "เพิ่ม แก้ไข และจัดกลุ่มเมนูของร้าน พร้อมกำหนดราคาขายตามช่องทาง", Coffee],
  ["คำนวณต้นทุนเมนู", "ผูกเมนูกับวัตถุดิบและสูตร เพื่อคำนวณต้นทุนต่อแก้วหรือต่อรายการ", CircleDollarSign],
  ["จัดการสต็อก", "ติดตามจำนวนวัตถุดิบคงเหลือ และแจ้งเตือนเมื่อวัตถุดิบใกล้หมด", Package],
  ["จัดการออเดอร์", "รองรับการบันทึกออเดอร์จากหน้าร้าน Pick-up และช่องทาง Delivery แบบ manual", ShoppingCart],
  ["วิเคราะห์กำไรจริง", "คำนวณยอดขาย ต้นทุน ค่าธรรมเนียมช่องทาง และกำไรขั้นต้นของแต่ละออเดอร์", TrendingUp],
  ["Dashboard สำหรับเจ้าของร้าน", "สรุปยอดขาย จำนวนออเดอร์ เมนูขายดี เมนูกำไรดี และวัตถุดิบใกล้หมดในหน้าเดียว", BarChart3],
  ["วิเคราะห์สถานการณ์ร้าน", "สรุปสถานการณ์ยอดขาย กำไร ช่องทางขาย เมนูเด่น และวัตถุดิบที่ควรตรวจสอบ เพื่อให้เจ้าของร้านตัดสินใจได้ง่ายขึ้น", PieChart],
] as const;

const flow = ["Menu", "Recipe", "Ingredient Cost", "Order", "Stock", "Channel Fee", "Real Profit", "Insight"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8f4ee] text-slate-900">
      <header className="sticky top-0 z-40 backdrop-blur border-b border-amber-100/70 bg-[#f8f4ee]/90">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3"><LogoBrand size="sm" /><span className="text-xs text-slate-500 hidden md:block">Business Intelligence for Small Shops</span></div>
          <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">
            <a href="#overview" className="hover:text-slate-900">ภาพรวมระบบ</a>
            <a href="#features" className="hover:text-slate-900">ฟีเจอร์</a>
            <a href="#usecases" className="hover:text-slate-900">เหมาะกับใคร</a>
            <a href="#how" className="hover:text-slate-900">วิธีทำงาน</a>
            <a href="#contact" className="hover:text-slate-900">ติดต่อเรา</a>
          </nav>
          <a href="#contact" className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium">ติดต่อเพื่อซื้อระบบ</a>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-6">
          <p className="inline-flex bg-amber-100 text-amber-900 px-3 py-1 rounded-full text-xs font-semibold">Valora Engine</p>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">ระบบหลังบ้านที่ช่วยให้ร้านเล็กเห็น “กำไรจริง” ไม่ใช่แค่ยอดขาย</h1>
          <p className="text-slate-600 text-lg">จัดการเมนู วัตถุดิบ สูตรต้นทุน ออเดอร์ สต็อก ช่องทางขาย และ Dashboard วิเคราะห์สถานการณ์ร้านในระบบเดียว เหมาะสำหรับร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็กที่ต้องการเติบโตอย่างมีระบบ</p>
          <div className="flex flex-wrap gap-3">
            <a href="#contact" className="bg-slate-900 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2">ติดต่อเพื่อซื้อระบบ <ArrowRight className="w-4 h-4"/></a>
            <a href="#features" className="bg-white border border-slate-300 px-5 py-3 rounded-xl font-semibold">ดูความสามารถของระบบ</a>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-sm text-slate-700">
            {["คำนวณต้นทุนต่อเมนู","แยกกำไรตามช่องทางขาย","เหมาะกับ Pick-up และ Delivery","ออกแบบจากการใช้งานจริงกับร้าน Brewway"].map(t=><div key={t} className="bg-white/80 border rounded-lg px-3 py-2">{t}</div>)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 rounded-3xl p-5 text-white shadow-2xl">
          <div className="bg-white/10 rounded-xl p-4 mb-3"><p className="text-xs text-slate-200">Dashboard Preview</p><p className="text-2xl font-bold">Gross Profit ฿18,940</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-xl p-3"><p className="text-xs">Profit Insight</p><p className="font-semibold">Margin 52%</p></div>
            <div className="bg-white/10 rounded-xl p-3"><p className="text-xs">Menu Costing</p><p className="font-semibold">Latte ฿28.4</p></div>
            <div className="bg-amber-300/20 border border-amber-200/40 rounded-xl p-3 col-span-2"><p className="text-xs">Low Stock Alert</p><p className="font-semibold">Fresh Milk ต่ำกว่าจุดเตือน</p></div>
          </div>
        </div>
      </section>

      <section className="bg-white border-y" id="pain"><div className="max-w-6xl mx-auto px-4 py-14"><h2 className="text-3xl font-bold mb-3">ขายดี ไม่ได้แปลว่ากำไรดีเสมอไป</h2><p className="text-slate-600 mb-6">เจ้าของร้านจำนวนมากเห็นแค่ยอดขายรวม แต่ไม่รู้ว่าหลังหักต้นทุนวัตถุดิบ แก้ว ฝา น้ำแข็ง และค่าธรรมเนียมแพลตฟอร์มแล้ว แต่ละเมนูเหลือกำไรจริงเท่าไหร่</p><div className="grid md:grid-cols-3 gap-4">{[["ไม่รู้ต้นทุนจริงต่อเมนู","หลายร้านยังคำนวณต้นทุนจากความรู้สึก หรือแยกข้อมูลไว้หลายไฟล์"],["Delivery ทำให้กำไรหาย","เมนูเดียวกันอาจกำไรไม่เท่ากันเมื่อขายผ่าน Pick-up, LINE OA, Grab หรือ LINE MAN"],["สต็อกกับยอดขายไม่เชื่อมกัน","ขายไปแล้วแต่ไม่รู้ว่าวัตถุดิบลดลงเท่าไหร่ หรือของใกล้หมดเมื่อไหร่"]].map(([t,d])=><div key={String(t)} className="bg-[#fffaf2] border border-amber-100 rounded-2xl p-5 shadow-sm"><h3 className="font-semibold mb-2">{t}</h3><p className="text-sm text-slate-600">{d}</p></div>)}</div></div></section>

      <section id="overview" className="max-w-6xl mx-auto px-4 py-14"><h2 className="text-3xl font-bold mb-4">ภาพรวมระบบ</h2><p className="text-slate-600 mb-2">Valora Engine ช่วยให้เจ้าของร้านจัดการข้อมูลสำคัญของธุรกิจในระบบเดียว ตั้งแต่เมนู วัตถุดิบ สูตรต้นทุน ออเดอร์ ช่องทางขาย สต็อก ไปจนถึงกำไรจริงของแต่ละเมนู</p><p className="text-slate-600 mb-6">ระบบถูกออกแบบมาเพื่อช่วยให้ร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็กสามารถมองเห็นภาพรวมของการขายได้ชัดเจนขึ้น ไม่ใช่เพียงยอดขายรวม แต่รวมถึงต้นทุนที่ใช้จริง กำไรที่เหลือจริง และวัตถุดิบที่ต้องบริหารในแต่ละวัน</p><div className="grid md:grid-cols-8 gap-2">{flow.map((s,i)=><div key={s} className="bg-white border rounded-lg p-2 text-center text-xs font-medium">{s}{i<flow.length-1?" →":""}</div>)}</div></section>

      <section id="features" className="bg-[#f3ede3] border-y"><div className="max-w-6xl mx-auto px-4 py-14"><h2 className="text-3xl font-bold mb-6">Core Features</h2><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{features.map(([title,desc,Icon])=><article key={title} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition"><div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-3"><Icon className="w-5 h-5"/></div><h3 className="font-semibold mb-1">{title}</h3><p className="text-sm text-slate-600">{desc}</p></article>)}</div></div></section>

      <section className="max-w-6xl mx-auto px-4 py-14"><h2 className="text-3xl font-bold mb-3">จากข้อมูลการขาย สู่การตัดสินใจที่ชัดขึ้น</h2><p className="text-slate-600 mb-6">Valora Engine ไม่ได้หยุดแค่การบันทึกออเดอร์ แต่ช่วยสรุปสถานการณ์ร้านจากข้อมูลจริง เช่น เมนูขายดี เมนูกำไรดี ช่องทางขายที่คุ้มที่สุด และวัตถุดิบที่ควรตรวจสอบ</p><div className="grid md:grid-cols-3 gap-4">{[["เมนูขายดีแต่กำไรต่ำ","Es-Yen ขายดีต่อเนื่อง แต่ margin ต่ำกว่าเมนูอื่น ควรตรวจสอบสูตรต้นทุนหรือราคาขาย"],["ช่องทาง Delivery ควรระวัง","ยอดขายผ่านแพลตฟอร์มสูง แต่กำไรเฉลี่ยต่อออเดอร์ต่ำกว่าช่องทาง Pick-up"],["วัตถุดิบใกล้หมด","Fresh Milk เหลือต่ำกว่าจุดแจ้งเตือน ควรเติมสต็อกก่อนเปิดขายรอบถัดไป"]].map(([t,d])=><div key={String(t)} className="bg-slate-900 text-white rounded-2xl p-5"><h3 className="font-semibold mb-2">{t}</h3><p className="text-sm text-slate-200">{d}</p></div>)}</div></section>

      <section id="usecases" className="bg-gradient-to-br from-slate-900 to-slate-800 text-white"><div className="max-w-6xl mx-auto px-4 py-14"><h2 className="text-3xl font-bold mb-3">เหมาะกับธุรกิจแบบไหน?</h2><p className="text-slate-200 mb-6">Valora Engine เหมาะสำหรับร้านกาแฟ ร้านเครื่องดื่ม ร้านอาหารขนาดเล็ก ธุรกิจแบบ Pick-up / Delivery และเจ้าของกิจการที่ต้องการรู้ต้นทุนและกำไรจริงของสินค้าแต่ละรายการ โดยไม่ต้องพึ่ง Excel หลายไฟล์หรือระบบบัญชีที่ซับซ้อนเกินไป</p><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">{["ร้านกาแฟ / Slow Bar","ร้านเครื่องดื่ม","ร้านที่ขายแบบ Pick-up","ร้านที่ขายผ่าน Delivery Platform","ธุรกิจขนาดเล็กที่ต้องการรู้กำไรจริง"].map(item=><div key={item} className="bg-white/10 border border-white/20 rounded-xl p-4 text-sm flex gap-2"><Store className="w-4 h-4 mt-0.5"/>{item}</div>)}</div></div></section>

      <section id="how" className="max-w-6xl mx-auto px-4 py-14"><h2 className="text-3xl font-bold mb-6">ระบบทำงานอย่างไร?</h2><div className="grid md:grid-cols-4 gap-4">{[["1. สร้างเมนูและวัตถุดิบ","กำหนดเมนู วัตถุดิบ หน่วย และต้นทุนต่อหน่วย"],["2. ผูกสูตรต้นทุน","ระบุว่าแต่ละเมนูใช้วัตถุดิบเท่าไหร่ เช่น 18g, 80ml หรือ 1 ชิ้น"],["3. รับออเดอร์และตัดสต็อก","บันทึกออเดอร์จาก Pick-up หรือ Delivery แล้วระบบคำนวณต้นทุนและสต็อก"],["4. ดูกำไรและ Insight","ดูยอดขาย กำไรจริง ช่องทางขายที่คุ้ม และสถานการณ์ร้านใน Dashboard"]].map(([t,d])=><div key={String(t)} className="bg-white border rounded-2xl p-5"><p className="font-semibold mb-2">{t}</p><p className="text-sm text-slate-600">{d}</p></div>)}</div></section>

      <section id="contact" className="max-w-6xl mx-auto px-4 pb-16"><div className="bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200 rounded-3xl p-8 md:p-10 shadow"><h2 className="text-3xl font-bold mb-3">สนใจใช้ Valora Engine กับธุรกิจของคุณ?</h2><p className="text-slate-700 mb-6">Valora Engine เปิดให้ใช้งานในรูปแบบติดต่อเพื่อติดตั้งและปรับระบบให้เหมาะกับธุรกิจของคุณ เหมาะสำหรับร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็กที่ต้องการรู้ต้นทุน กำไรจริง สต็อก และออเดอร์ในระบบเดียว</p><div className="grid md:grid-cols-2 gap-4"><div className="bg-white rounded-xl p-4 border"><p className="font-semibold mb-1">ช่องทางติดต่อ</p><p className="text-sm font-medium">Instagram</p>{/* MARKING: Add Brewway / Valora Instagram username or URL here later */}<p className="text-sm text-slate-600">[MARKING: เพิ่มชื่อ IG หรือ URL ภายหลัง]</p></div><div className="bg-white rounded-xl p-4 border"><p className="font-semibold mb-1">Email</p><p className="text-slate-700">pongsathon.po@kkumail.com</p></div></div></div></section>

      <footer className="bg-slate-900 text-slate-300"><div className="max-w-6xl mx-auto px-4 py-8"><p className="text-white font-semibold">Valora Engine</p><p className="text-sm mt-1">ระบบปฏิบัติการธุรกิจสำหรับร้านกาแฟ ร้านเครื่องดื่ม และธุรกิจขนาดเล็ก</p><p className="text-sm mt-1">Email: pongsathon.officialwork@gmail.com</p><p className="text-xs mt-3">© {new Date().getFullYear()} Valora Engine</p></div></footer>
    </div>
  );
}

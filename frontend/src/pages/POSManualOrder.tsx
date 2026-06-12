import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import FormField from "@/components/shared/FormField";
import DataTable from "@/components/shared/DataTable";
import { menuCatalogService, type MenuItem } from "@/features/store/catalogService";
import { orderService, type OrderItemInput } from "@/features/store/orderService";

export default function POSManualOrder() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [channels] = useState(orderService.listChannels());
  const [channelId, setChannelId] = useState("c1");
  const [menuId, setMenuId] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => { menuCatalogService.list().then((m)=>{setMenus(m); if(m[0]) setMenuId(m[0].id);}); }, []);
  useEffect(() => { if(items.length) orderService.quote(channelId, items).then(setQuote); else setQuote(null); }, [channelId, items]);

  function addItem() {
    if (!menuId || qty <= 0) return;
    setItems((prev) => [...prev, { menuId, quantity: qty, note: note.trim() || undefined }]);
    setQty(1); setNote("");
  }

  async function submit() {
    setError("");
    try {
      await orderService.createManualOrder(channelId, items, "accepted", "unpaid");
      setItems([]);
      setQuote(null);
    } catch (e: any) { setError(e?.message ?? "ไม่สามารถบันทึกออเดอร์"); }
  }

  return <AppLayout><div className="space-y-4 max-w-4xl"><h1 className="page-title">POS / รับออเดอร์หน้าร้าน</h1>
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      เครื่องมือต้นแบบ (เฉพาะโหมดพัฒนา) — ข้อมูลถูกเก็บในเครื่องนี้เท่านั้น ไม่ซิงก์เข้าออเดอร์จริง รายงาน หรือการชำระเงิน
    </div>
    <div className="stat-card grid md:grid-cols-4 gap-3">
      <FormField label="ช่องทาง"><select className="form-input" value={channelId} onChange={(e)=>setChannelId(e.target.value)}>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
      <FormField label="เมนู"><select className="form-input" value={menuId} onChange={(e)=>setMenuId(e.target.value)}>{menus.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></FormField>
      <FormField label="จำนวน"><input type="number" className="form-input" value={qty} min={1} onChange={(e)=>setQty(Number(e.target.value))}/></FormField>
      <FormField label="โน้ต"><input className="form-input" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="เช่น less sweet"/></FormField>
      <div className="md:col-span-4 flex gap-2"><button className="px-4 py-2 rounded border" onClick={addItem}>เพิ่มรายการ</button><button className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50" onClick={submit} disabled={!items.length}>บันทึกออเดอร์</button></div>
      {error ? <p className="md:col-span-4 text-sm text-red-600">{error}</p> : null}
    </div>
    <DataTable columns={[{key:"menuId",header:"เมนู"},{key:"quantity",header:"จำนวน"},{key:"note",header:"โน้ต"}]} rows={items as any} />
    {quote ? <div className="grid md:grid-cols-4 gap-3"> <div className="kpi-card"><p className="metric-label">Total Amount</p><p className="metric-value">฿{quote.totalAmount.toFixed(2)}</p></div><div className="kpi-card"><p className="metric-label">Total Cost</p><p className="metric-value">฿{quote.totalCost.toFixed(2)}</p></div><div className="kpi-card"><p className="metric-label">Channel Fee</p><p className="metric-value">฿{quote.totalChannelFee.toFixed(2)}</p></div><div className="kpi-card"><p className="metric-label">Gross Profit</p><p className="metric-value">฿{quote.grossProfit.toFixed(2)}</p></div></div> : null}
  </div></AppLayout>;
}

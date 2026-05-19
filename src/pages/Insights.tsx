import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/lib/supabase";
import { useRoleGuard } from "@/lib/guards";

type Status = "normal" | "warning" | "critical" | "positive";
type DatePreset = "today" | "last7" | "custom";

const safeDivide = (n: number, d: number) => (d === 0 ? 0 : n / d);
const formatCurrency = (v: number) => `฿${(Number.isFinite(v) ? v : 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const formatPercent = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;
const calculateMargin = (profit: number, sales: number) => safeDivide(profit, sales) * 100;
const getStatusFromMargin = (margin: number): Status => (margin < 30 ? "warning" : margin >= 50 ? "positive" : "normal");

export default function InsightsPage() {
  const { checking, accessDenied } = useRoleGuard(["owner", "admin", "manager"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<DatePreset>("today");
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [state, setState] = useState<any>(null);

  const range = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (preset === "today") return { from: today, to: today };
    if (preset === "last7") {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    return { from: fromDate, to: toDate };
  }, [preset, fromDate, toDate]);

  useEffect(() => { if (!checking && !accessDenied) load(); }, [checking, accessDenied, range.from, range.to]);

  async function load() {
    setLoading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("no user");

      const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", uid).maybeSingle();
      if (!profile?.store_id) throw new Error("ไม่พบ store_id ของผู้ใช้");

      const fromTs = `${range.from}T00:00:00.000Z`;
      const toTs = `${range.to}T23:59:59.999Z`;

      const [{ data: orders }, { data: items }, { data: products }, { data: channels }, { data: ingredients }, { data: recipes }] = await Promise.all([
        supabase.from("orders").select("id,channel_id,total_amount,total_cost,channel_fee,gross_profit,created_at,store_id").eq("store_id", profile.store_id).gte("created_at", fromTs).lte("created_at", toTs),
        supabase.from("order_items").select("order_id,product_id,quantity,total_price,total_cost").in("order_id", []),
        supabase.from("products").select("id,name").eq("store_id", profile.store_id),
        supabase.from("sales_channels").select("id,name,type").eq("store_id", profile.store_id),
        supabase.from("ingredients").select("id,name,unit,current_stock,low_stock_threshold").eq("store_id", profile.store_id),
        supabase.from("recipes").select("product_id,ingredient_id,quantity_used").eq("store_id", profile.store_id),
      ]);

      const orderRows = orders ?? [];
      const orderIds = orderRows.map((o: any) => o.id);
      const { data: orderItems } = orderIds.length ? await supabase.from("order_items").select("order_id,product_id,quantity,total_price,total_cost").in("order_id", orderIds) : { data: [] as any[] };

      const totalOrders = orderRows.length;
      const totalSales = orderRows.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
      const totalCost = orderRows.reduce((s: number, o: any) => s + Number(o.total_cost || 0), 0);
      const grossProfit = orderRows.reduce((s: number, o: any) => s + Number(o.gross_profit || 0), 0);
      const grossMarginPercent = calculateMargin(grossProfit, totalSales);
      const totalItemQty = (orderItems ?? []).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);

      const pMap = new Map((products ?? []).map((p: any) => [p.id, p.name]));
      const menuMap = new Map<string, any>();
      for (const it of orderItems ?? []) {
        const key = it.product_id;
        const cur = menuMap.get(key) ?? { name: pMap.get(key) ?? "Unknown", quantity: 0, revenue: 0, cost: 0, profit: 0 };
        cur.quantity += Number(it.quantity || 0);
        cur.revenue += Number(it.total_price || 0);
        cur.cost += Number(it.total_cost || 0);
        cur.profit = cur.revenue - cur.cost;
        cur.margin = calculateMargin(cur.profit, cur.revenue);
        menuMap.set(key, cur);
      }
      const menuStats = [...menuMap.values()];
      const byQty = [...menuStats].sort((a,b)=>b.quantity-a.quantity)[0] ?? null;
      const byRevenue = [...menuStats].sort((a,b)=>b.revenue-a.revenue)[0] ?? null;
      const byProfit = [...menuStats].sort((a,b)=>b.profit-a.profit)[0] ?? null;
      const lowMarginBestSeller = menuStats.find((m)=>m.quantity >=5 && m.margin < 30) ?? null;

      const cMap = new Map((channels ?? []).map((c: any) => [c.id, c]));
      const chAgg = new Map<string, any>();
      for (const o of orderRows) {
        const c = cMap.get(o.channel_id) ?? { id: o.channel_id, name: "Unknown", type: "manual" };
        const cur = chAgg.get(c.id) ?? { name: c.name, type: c.type, sales: 0, cost: 0, fee: 0, profit: 0, orders: 0 };
        cur.sales += Number(o.total_amount || 0);
        cur.cost += Number(o.total_cost || 0);
        cur.fee += Number(o.channel_fee || 0);
        cur.profit += Number(o.gross_profit || 0);
        cur.orders += 1;
        cur.avgProfitPerOrder = safeDivide(cur.profit, cur.orders);
        chAgg.set(c.id, cur);
      }
      const channelStats = [...chAgg.values()];
      const bestProfitChannel = [...channelStats].sort((a,b)=>b.profit-a.profit)[0] ?? null;
      const bestAvgChannel = [...channelStats].sort((a,b)=>b.avgProfitPerOrder-a.avgProfitPerOrder)[0] ?? null;
      const directAvg = safeDivide(channelStats.filter(c=>c.type==="direct").reduce((s,c)=>s+c.profit,0), channelStats.filter(c=>c.type==="direct").reduce((s,c)=>s+c.orders,0));
      const deliveryAvg = safeDivide(channelStats.filter(c=>c.type==="delivery").reduce((s,c)=>s+c.profit,0), channelStats.filter(c=>c.type==="delivery").reduce((s,c)=>s+c.orders,0));
      const riskChannel = deliveryAvg < directAvg && channelStats.find(c=>c.type==="delivery") ? channelStats.filter(c=>c.type==="delivery").sort((a,b)=>a.avgProfitPerOrder-b.avgProfitPerOrder)[0] : null;

      const lowStock = (ingredients ?? []).filter((i: any) => Number(i.current_stock) <= Number(i.low_stock_threshold)).map((ing: any) => {
        const uses = (recipes ?? []).filter((r: any) => r.ingredient_id === ing.id && Number(r.quantity_used) > 0);
        const available = uses.length ? Math.floor(Math.min(...uses.map((u: any) => Number(ing.current_stock) / Number(u.quantity_used)))) : null;
        return { ...ing, availableItems: Number.isFinite(available as number) ? available : null };
      });

      const summaryText = totalOrders === 0
        ? "ยังไม่มีออเดอร์ในช่วงเวลาที่เลือก จึงยังไม่สามารถวิเคราะห์ยอดขายและกำไรได้"
        : `วันนี้ร้านมียอดขายรวม ${formatCurrency(totalSales)} จากทั้งหมด ${totalOrders} ออเดอร์ และมีกำไรขั้นต้น ${formatCurrency(grossProfit)} คิดเป็นอัตรากำไรขั้นต้นประมาณ ${formatPercent(grossMarginPercent)}\nเมนูที่ขายดีที่สุดคือ ${byQty?.name ?? "-"} จำนวน ${byQty?.quantity ?? 0} รายการ ขณะที่เมนูที่ให้กำไรสูงที่สุดคือ ${byProfit?.name ?? "-"}\nช่องทางที่ทำกำไรได้ดีที่สุดคือ ${bestProfitChannel?.name ?? "-"}${riskChannel ? ` ส่วนช่องทางที่ควรระวังคือ ${riskChannel.name}` : " และยังไม่พบความเสี่ยงเด่นชัดจากช่องทาง Delivery ในช่วงเวลาที่เลือก"}\n${lowStock[0] ? `วัตถุดิบที่ควรตรวจสอบคือ ${lowStock[0].name} เพราะปริมาณคงเหลือต่ำกว่าจุดแจ้งเตือน` : "สถานการณ์สต็อกโดยรวมยังอยู่ในระดับปกติ"}`;

      const recommendations = [
        totalOrders === 0 ? { status: "normal", text: "ยังไม่มีออเดอร์ในช่วงเวลาที่เลือก" } : null,
        grossProfit < 0 ? { status: "critical", text: "กำไรขั้นต้นติดลบ ควรตรวจสอบต้นทุนหรือราคาขายทันที" } : null,
        grossMarginPercent < 30 ? { status: "warning", text: "อัตรากำไรขั้นต้นต่ำกว่า 30% ควรตรวจสอบต้นทุนวัตถุดิบหรือราคาขาย" } : null,
        grossMarginPercent >= 50 ? { status: "positive", text: "อัตรากำไรขั้นต้นอยู่ในระดับดี" } : null,
        riskChannel ? { status: "warning", text: "ช่องทาง Delivery อาจทำให้กำไรต่อออเดอร์ลดลง ควรทบทวนราคาขายบนแพลตฟอร์ม" } : { status: "normal", text: "ยังไม่พบความเสี่ยงเด่นชัดจากช่องทาง Delivery ในช่วงเวลาที่เลือก" },
        lowStock.length ? { status: "warning", text: "มีวัตถุดิบใกล้หมด ควรเติมสต็อก" } : null,
        byQty && byQty.margin < 30 ? { status: "warning", text: "เมนูขายดีที่สุดมีกำไรต่ำ ควรตรวจสอบสูตรต้นทุนหรือราคาขาย" } : null,
      ].filter(Boolean);

      setState({ totalOrders, totalSales, totalCost, grossProfit, grossMarginPercent, totalItemQty, byQty, byRevenue, byProfit, lowMarginBestSeller, channelStats, bestProfitChannel, bestAvgChannel, riskChannel, lowStock, summaryText, recommendations });
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }

  if (checking || loading) return <AppLayout><div className="stat-card">กำลังโหลด...</div></AppLayout>;
  if (accessDenied) return <div className="min-h-screen flex items-center justify-center text-xl font-semibold">Access Denied</div>;
  if (error) return <AppLayout><div className="stat-card text-red-600">{error}</div></AppLayout>;

  return <AppLayout><div className="space-y-4">
    <div><h1 className="page-title">วิเคราะห์สถานการณ์ร้าน</h1><p className="page-subtitle">สรุปยอดขาย กำไร เมนู ช่องทางขาย และวัตถุดิบ เพื่อช่วยให้เจ้าของร้านตัดสินใจได้ง่ายขึ้น</p></div>
    <div className="stat-card grid md:grid-cols-4 gap-2">
      <select className="form-input" value={preset} onChange={e=>setPreset(e.target.value as DatePreset)}><option value="today">Today</option><option value="last7">Last 7 days</option><option value="custom">Custom date range</option></select>
      <input className="form-input" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} disabled={preset!=="custom"} />
      <input className="form-input" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} disabled={preset!=="custom"} />
      <button className="bg-primary text-primary-foreground rounded px-3" onClick={load}>อัปเดต</button>
    </div>
    {state.totalOrders === 0 ? <div className="stat-card">ยังไม่มีข้อมูลออเดอร์สำหรับวิเคราะห์ในช่วงเวลานี้</div> : null}
    <div className="grid md:grid-cols-3 gap-3">
      {[['จำนวนออเดอร์', state.totalOrders],['ยอดขายรวม', formatCurrency(state.totalSales)],['ต้นทุนรวม', formatCurrency(state.totalCost)],['กำไรขั้นต้น', formatCurrency(state.grossProfit)],['อัตรากำไรขั้นต้น', formatPercent(state.grossMarginPercent)],['กำไรเฉลี่ยต่อออเดอร์', formatCurrency(safeDivide(state.grossProfit,state.totalOrders))],['กำไรเฉลี่ยต่อรายการ/แก้ว', formatCurrency(safeDivide(state.grossProfit,state.totalItemQty))]].map(([k,v])=><div key={String(k)} className="kpi-card"><p className="metric-label">{k}</p><p className="metric-value">{v as any}</p></div>)}
    </div>
    <div className="stat-card whitespace-pre-line"><h3 className="font-semibold mb-2">สรุปสถานการณ์ร้าน</h3>{state.summaryText}</div>
  </div></AppLayout>;
}

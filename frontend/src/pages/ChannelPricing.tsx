import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import FormField from "@/components/shared/FormField";
import { ingredientService, menuCatalogService, recipeService, type IngredientItem, type MenuItem } from "@/features/store/catalogService";
import { orderService, type ChannelPrice, type SalesChannel } from "@/features/store/orderService";
import { calculateChannelFeeAndProfit } from "@/features/store/profitCalculator";

type PriceForm = { id?: string; menuId: string; channelId: string; price: string; isActive: boolean };
const emptyForm: PriceForm = { menuId: "", channelId: "", price: "0", isActive: true };

export default function ChannelPricing() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [prices, setPrices] = useState<ChannelPrice[]>([]);
  const [form, setForm] = useState<PriceForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string>("");

  const activeMenus = useMemo(() => menus.filter((m) => m.isActive), [menus]);
  const activeChannels = useMemo(() => channels.filter((c) => c.isActive), [channels]);

  const refresh = async () => {
    setMenus(await menuCatalogService.list());
    setIngredients(await ingredientService.list());
    setChannels(orderService.listChannels());
    setPrices(orderService.listChannelPrices());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const priceByMenuChannel = useMemo(() => {
    return prices.reduce<Record<string, Record<string, ChannelPrice>>>((acc, row) => {
      if (!acc[row.menuId]) acc[row.menuId] = {};
      acc[row.menuId][row.channelId] = row;
      return acc;
    }, {});
  }, [prices]);

  const handleSubmit = () => {
    setError("");
    const priceNum = Number(form.price);
    if (!form.menuId || !form.channelId) return setError("กรุณาเลือกเมนูและช่องทาง");
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("กรุณากรอกราคาให้ถูกต้อง (>= 0)");
    orderService.upsertChannelPrice({
      id: form.id,
      menuId: form.menuId,
      channelId: form.channelId,
      price: priceNum,
      isActive: form.isActive,
    });
    setShowForm(false);
    setForm(emptyForm);
    void refresh();
  };

  const handleDelete = (id: string) => {
    orderService.deleteChannelPrice(id);
    void refresh();
  };

  const matrixRows = activeMenus.map((menu) => {
    const recipeRows = recipeService.listByMenu(menu.id);
    const recipeCost = recipeRows.reduce((sum, r) => {
      const ing = ingredients.find((i) => i.id === r.ingredientId);
      return sum + (ing ? ing.costPerUnit * r.quantityUsed : 0);
    }, 0);
    const hasCost = recipeRows.length > 0;

    return {
      ...menu,
      recipeCost,
      hasCost,
      prices: activeChannels.map((ch) => {
        const priceRow = priceByMenuChannel[menu.id]?.[ch.id] ?? null;
        if (!priceRow) return { channel: ch, price: null, profitText: "ยังไม่ได้ตั้งราคา" };
        if (!hasCost) return { channel: ch, price: priceRow, profitText: "รอตั้งค่าต้นทุน" };
        const { channelFee, estimatedProfit } = calculateChannelFeeAndProfit({
          channelPrice: priceRow.price,
          feeType: ch.feeType,
          feeValue: ch.feeValue,
          recipeCost,
          packagingCost: 0,
        });
        return { channel: ch, price: priceRow, channelFee, estimatedProfit };
      }),
    };
  });

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="page-title">ราคาตามช่องทาง</h1>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold"
            onClick={() => { setForm(emptyForm); setShowForm(true); setError(""); }}
          >
            <Plus className="w-4 h-4" /> เพิ่มราคา
          </button>
        </div>

        {showForm ? (
          <div className="stat-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base">{form.id ? "แก้ไขราคา" : "ตั้งราคาช่องทาง"}</h2>
              <button className="text-sm text-muted-foreground" onClick={() => setShowForm(false)}>ปิดฟอร์ม</button>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              <FormField label="เมนู">
                <select
                  className="form-input"
                  value={form.menuId}
                  onChange={(e) => setForm({ ...form, menuId: e.target.value })}
                >
                  <option value="">-- เลือกเมนู --</option>
                  {activeMenus.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="ช่องทาง">
                <select
                  className="form-input"
                  value={form.channelId}
                  onChange={(e) => setForm({ ...form, channelId: e.target.value })}
                >
                  <option value="">-- เลือกช่องทาง --</option>
                  {activeChannels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="ราคา (฿)">
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </FormField>
              <FormField label="สถานะ">
                <select
                  className="form-input"
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}
                >
                  <option value="active">เปิดใช้งาน</option>
                  <option value="inactive">ปิดใช้งาน</option>
                </select>
              </FormField>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold"
                onClick={handleSubmit}
              >
                {form.id ? "บันทึกการแก้ไข" : "เพิ่มราคา"}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded border text-sm"
                onClick={() => { setForm(emptyForm); setShowForm(false); setError(""); }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : null}

        <div className="stat-card overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-48">เมนู</th>
                {activeChannels.map((c) => (
                  <th key={c.id}>{c.name}</th>
                ))}
                <th className="w-28">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.id}>
                  <td className="font-semibold">{row.name}</td>
                  {activeChannels.map((ch, idx) => {
                    const cell = row.prices[idx] as any;
                    const priceRow = cell?.price ?? null;
                    return (
                      <td key={ch.id} className="text-center">
                        {priceRow ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-sm underline"
                            onClick={() => {
                              setForm({ id: priceRow.id, menuId: row.id, channelId: ch.id, price: String(priceRow.price), isActive: priceRow.isActive });
                              setShowForm(true);
                            }}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>฿{priceRow.price}</span>
                              {typeof cell?.estimatedProfit === "number" ? (
                                <span className={`text-xs ${cell.estimatedProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                  กำไร {cell.estimatedProfit.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">{cell?.profitText ?? "รอตั้งค่าต้นทุน"}</span>
                              )}
                              <Edit3 className="w-3 h-3" />
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => {
                              setForm({ menuId: row.id, channelId: ch.id, price: "0", isActive: true });
                              setShowForm(true);
                            }}
                          >
                            ยังไม่ได้ตั้งราคา
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center">
                    <div className="flex flex-col gap-1 items-center">
                      {activeChannels.map((ch) => {
                        const priceRow = priceByMenuChannel[row.id]?.[ch.id];
                        return priceRow ? (
                          <button
                            key={priceRow.id}
                            type="button"
                            className="text-xs text-destructive inline-flex items-center gap-1"
                            onClick={() => handleDelete(priceRow.id)}
                          >
                            <Trash2 className="w-3 h-3" /> ลบ {ch.name}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {matrixRows.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">ยังไม่มีเมนูหรือช่องทางที่เปิดใช้งาน</p>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}

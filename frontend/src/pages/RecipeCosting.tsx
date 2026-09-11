import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import DataTable from "@/components/shared/DataTable";
import FormField from "@/components/shared/FormField";
import { ingredientService, menuCatalogService, recipeService, type IngredientItem, type MenuItem, type RecipeRow } from "@/features/store/catalogService";
import { FormSelect } from "@/components/ui/form-select";

type RecipeCostRow = RecipeRow & {
  ingredient: string;
  unit: string;
  costPerUnit: number;
  lineCost: number;
};

export default function RecipeCosting() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [qty, setQty] = useState("1");
  const [tick, setTick] = useState(0);

  useEffect(() => { Promise.all([menuCatalogService.list(), ingredientService.list()]).then(([m, i]) => { setMenus(m); setIngredients(i); if (m[0]) setSelectedMenu(m[0].id); }); }, []);
  const recipeRows = useMemo(() => selectedMenu ? recipeService.listByMenu(selectedMenu) : [], [selectedMenu, tick]);
  const enriched = useMemo<RecipeCostRow[]>(() => recipeRows.map((r) => {
    const ing = ingredients.find((x) => x.id === r.ingredientId);
    const costPerUnit = ing?.costPerUnit ?? 0;
    return { ...r, ingredient: ing?.name ?? "Unknown", unit: ing?.unit ?? "", costPerUnit, lineCost: Number((r.quantityUsed * costPerUnit).toFixed(2)) };
  }), [recipeRows, ingredients]);

  const menu = menus.find((m) => m.id === selectedMenu);
  const menuCost = enriched.reduce((s, r) => s + r.lineCost, 0);
  const grossProfit = (menu?.basePrice ?? 0) - menuCost;
  const grossMarginPercent = (menu?.basePrice ?? 0) > 0 ? (grossProfit / (menu?.basePrice ?? 1)) * 100 : 0;

  function addRow() {
    if (!selectedMenu || !ingredientId || Number(qty) <= 0) return;
    const rows = recipeService.listByMenu(selectedMenu);
    const exists = rows.find((r) => r.ingredientId === ingredientId);
    const next = exists ? rows.map((r) => r.ingredientId === ingredientId ? { ...r, quantityUsed: Number(qty) } : r) : [...rows, { ingredientId, quantityUsed: Number(qty) }];
    recipeService.setByMenu(selectedMenu, next);
    setQty("1");
    setTick((x) => x + 1);
  }

  function removeRow(target: string) {
    const rows = recipeService.listByMenu(selectedMenu).filter((r) => r.ingredientId !== target);
    recipeService.setByMenu(selectedMenu, rows);
    setTick((x) => x + 1);
  }

  return <AppLayout><div className="space-y-4"><h1 className="page-title">สูตรและต้นทุนเมนู</h1>
    <div className="stat-card grid md:grid-cols-4 gap-3">
      <FormField label="เลือกเมนู"><FormSelect value={selectedMenu} onValueChange={setSelectedMenu} placeholder="เลือกเมนู" options={menus.map((m) => ({ value: m.id, label: m.name }))} /></FormField>
      <FormField label="วัตถุดิบ"><FormSelect value={ingredientId} onValueChange={setIngredientId} placeholder="เลือกวัตถุดิบ" options={ingredients.map((i) => ({ value: i.id, label: i.name }))} /></FormField>
      <FormField label="ปริมาณที่ใช้"><input className="form-input" type="number" value={qty} onChange={(e)=>setQty(e.target.value)} /></FormField>
      <div className="flex items-end"><button className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={addRow}>เพิ่ม/อัปเดตสูตร</button></div>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <div className="kpi-card"><p className="metric-label">Menu Cost</p><p className="metric-value">฿{menuCost.toFixed(2)}</p></div>
      <div className="kpi-card"><p className="metric-label">Gross Profit</p><p className="metric-value">฿{grossProfit.toFixed(2)}</p></div>
      <div className="kpi-card"><p className="metric-label">Gross Margin %</p><p className="metric-value">{grossMarginPercent.toFixed(1)}%</p></div>
    </div>
    <DataTable<RecipeCostRow> columns={[{key:"ingredient",header:"วัตถุดิบ"},{key:"quantityUsed",header:"ปริมาณ"},{key:"unit",header:"หน่วย"},{key:"costPerUnit",header:"ต้นทุน/หน่วย"},{key:"lineCost",header:"ต้นทุนรวม"},{key:"remove",header:"",render:(r)=><button className="text-red-600" onClick={()=>removeRow(r.ingredientId)}>ลบ</button>}]} rows={enriched} />
  </div></AppLayout>;
}

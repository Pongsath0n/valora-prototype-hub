import { supabase } from "@/lib/supabase";

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  imageUrl: string | null;
  isActive: boolean;
};

export type IngredientItem = {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  currentStock: number;
  lowStockThreshold: number;
  isActive: boolean;
};

export type RecipeRow = {
  ingredientId: string;
  quantityUsed: number;
};

const K_MENU = "valora:menu:v2";
const K_ING = "valora:ingredients:v2";
const K_RECIPE = "valora:recipes:v2";

const seedMenu: MenuItem[] = [
  { id: "m1", name: "Iced Latte", category: "Coffee", basePrice: 75, imageUrl: null, isActive: true },
  { id: "m2", name: "Americano", category: "Coffee", basePrice: 60, imageUrl: null, isActive: true },
];
const seedIng: IngredientItem[] = [
  { id: "i1", name: "Coffee Bean", unit: "g", costPerUnit: 1.5, currentStock: 2000, lowStockThreshold: 500, isActive: true },
  { id: "i2", name: "Milk", unit: "ml", costPerUnit: 0.04, currentStock: 4000, lowStockThreshold: 1000, isActive: true },
];

function load<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}
function save<T>(k: string, v: T) { localStorage.setItem(k, JSON.stringify(v)); }
function uid(prefix: string) { return `${prefix}_${Date.now()}_${Math.floor(Math.random()*9999)}`; }

export const menuCatalogService = {
  async list(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,base_price,image_url,is_active,product_categories(name)")
        .order("created_at", { ascending: false });

      if (!error && data) {
        return data.map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.product_categories?.name ?? "General",
          basePrice: Number(r.base_price ?? 0),
          isActive: !!r.is_active,
          imageUrl: r.image_url ?? null,
        }));
      }
    } catch {}
    return load<MenuItem[]>(K_MENU, seedMenu);
  },

  async upsert(item: Partial<MenuItem> & { name: string; category: string; basePrice: number }): Promise<void> {
    try {
      if (item.id) {
        const { error } = await supabase
          .from("products")
          .update({
            name: item.name,
            base_price: item.basePrice,
            image_url: item.imageUrl ?? null,
          })
          .eq("id", item.id);
        if (!error) return;
      }
    } catch {}

    const local = load<MenuItem[]>(K_MENU, seedMenu);
    if (item.id) {
      save(K_MENU, local.map((m) => m.id === item.id ? { ...m, ...item } as MenuItem : m));
    } else {
      save(K_MENU, [{ id: uid("m"), isActive: true, imageUrl: null, ...item } as MenuItem, ...local]);
    }
  },

  async setActive(id: string, isActive: boolean) {
    try {
      const { error } = await supabase.from("products").update({ is_active: isActive }).eq("id", id);
      if (!error) return;
    } catch {}

    const local = load<MenuItem[]>(K_MENU, seedMenu);
    save(K_MENU, local.map((m) => m.id === id ? { ...m, isActive } : m));
  },
};

export const ingredientService = {
  async list(): Promise<IngredientItem[]> { return load<IngredientItem[]>(K_ING, seedIng); },
  async upsert(item: Partial<IngredientItem> & { name: string; unit: string; costPerUnit: number; currentStock: number; lowStockThreshold: number }) {
    const local = load<IngredientItem[]>(K_ING, seedIng);
    if (item.id) save(K_ING, local.map((x) => x.id === item.id ? { ...x, ...item } as IngredientItem : x));
    else save(K_ING, [{ id: uid("i"), isActive: true, ...item } as IngredientItem, ...local]);
  },
  async setActive(id: string, isActive: boolean) {
    const local = load<IngredientItem[]>(K_ING, seedIng);
    save(K_ING, local.map((x) => x.id === id ? { ...x, isActive } : x));
  },
};

export const recipeService = {
  listByMenu(menuId: string): RecipeRow[] {
    const map = load<Record<string, RecipeRow[]>>(K_RECIPE, {});
    return map[menuId] ?? [];
  },
  setByMenu(menuId: string, rows: RecipeRow[]) {
    const map = load<Record<string, RecipeRow[]>>(K_RECIPE, {});
    map[menuId] = rows;
    save(K_RECIPE, map);
  },
};

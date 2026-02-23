/**
 * Mock persistence layer using localStorage.
 * All keys are namespaced under "valora:" to avoid collisions.
 * Each function provides typed get/set/reset with sane defaults.
 */
import type { Shop, FixedCostRow, MenuRow, SavedScenario } from "./types";

// ─── Storage keys ──────────────────────────────────────────────────────────────
const KEY_SHOP = "valora:shop";
const KEY_FIXED_COSTS = "valora:fixedCosts";
const KEY_MENU = "valora:menu";
const KEY_SCENARIOS = "valora:scenarios";

// ─── Default seed data (Thai café demo) ───────────────────────────────────────
const DEFAULT_SHOP: Shop = {
  name: "ร้านกาแฟบ้านสวน",
  daysOpen: 26,
  targetProfit: 30000,
};

const DEFAULT_FIXED_COSTS: FixedCostRow[] = [
  { id: 1, label: "ค่าเช่า", amount: 15000 },
  { id: 2, label: "ค่าแรง", amount: 25000 },
  { id: 3, label: "ค่าน้ำไฟ", amount: 5000 },
  { id: 4, label: "ค่าใช้จ่ายอื่น", amount: 5000 },
];

const DEFAULT_MENU: MenuRow[] = [
  { id: 1, name: "ลาเต้เย็น", price: 75, totalCost: 28.2, ingredientCost: 22, packagingCost: 4.2, deliveryFee: 2, mix: 28 },
  { id: 2, name: "คาปูชิโน่ร้อน", price: 65, totalCost: 27.2, ingredientCost: 21, packagingCost: 3.2, deliveryFee: 3, mix: 23 },
  { id: 3, name: "มัทฉะลาเต้", price: 85, totalCost: 38.0, ingredientCost: 30, packagingCost: 5, deliveryFee: 3, mix: 18 },
  { id: 4, name: "อเมริกาโน่", price: 55, totalCost: 17.5, ingredientCost: 13, packagingCost: 2.5, deliveryFee: 2, mix: 17 },
  { id: 5, name: "ชาเขียวนม", price: 75, totalCost: 35.5, ingredientCost: 28, packagingCost: 5.5, deliveryFee: 2, mix: 14 },
];

const DEFAULT_SCENARIOS: SavedScenario[] = [
  { id: 1, name: "ขึ้นราคา 5 บาท", timestamp: "20 ก.พ. 2569 14:30", fixedCosts: 50000, avgPrice: 76.1, avgCost: 28.9, daysOpen: 26, targetProfit: 30000, notes: "ทดสอบผลกระทบจากการขึ้นราคาเฉลี่ย 5 บาท" },
  { id: 2, name: "ลดค่าเช่า", timestamp: "18 ก.พ. 2569 10:15", fixedCosts: 40000, avgPrice: 71.1, avgCost: 28.9, daysOpen: 26, targetProfit: 30000, notes: "ย้ายไปทำเลถูกลง" },
];

// ─── Generic helpers ───────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Shop ──────────────────────────────────────────────────────────────────────
export const shopService = {
  get: (): Shop => load<Shop>(KEY_SHOP, DEFAULT_SHOP),
  set: (data: Shop): void => save(KEY_SHOP, data),
  reset: (): void => save(KEY_SHOP, DEFAULT_SHOP),
};

// ─── Fixed Costs ───────────────────────────────────────────────────────────────
export const fixedCostService = {
  get: (): FixedCostRow[] => load<FixedCostRow[]>(KEY_FIXED_COSTS, DEFAULT_FIXED_COSTS),
  set: (rows: FixedCostRow[]): void => save(KEY_FIXED_COSTS, rows),
  reset: (): void => save(KEY_FIXED_COSTS, DEFAULT_FIXED_COSTS),
  total: (): number =>
    fixedCostService.get().reduce((s, r) => s + Number(r.amount), 0),
};

// ─── Menu ──────────────────────────────────────────────────────────────────────
export const menuService = {
  get: (): MenuRow[] => load<MenuRow[]>(KEY_MENU, DEFAULT_MENU),
  set: (rows: MenuRow[]): void => save(KEY_MENU, rows),
  reset: (): void => save(KEY_MENU, DEFAULT_MENU),
};

// ─── Scenarios ─────────────────────────────────────────────────────────────────
export const scenarioService = {
  get: (): SavedScenario[] =>
    load<SavedScenario[]>(KEY_SCENARIOS, DEFAULT_SCENARIOS),
  save: (scenario: SavedScenario): void => {
    const current = scenarioService.get();
    const exists = current.findIndex((s) => s.id === scenario.id);
    if (exists >= 0) {
      current[exists] = scenario;
      save(KEY_SCENARIOS, current);
    } else {
      save(KEY_SCENARIOS, [scenario, ...current]);
    }
  },
  delete: (id: number): void => {
    save(
      KEY_SCENARIOS,
      scenarioService.get().filter((s) => s.id !== id)
    );
  },
  nextId: (): number => {
    const items = scenarioService.get();
    return items.length > 0 ? Math.max(...items.map((s) => s.id)) + 1 : 1;
  },
  reset: (): void => save(KEY_SCENARIOS, DEFAULT_SCENARIOS),
};

// ─── Nuke all data (dev / onboarding reset) ───────────────────────────────────
export function resetAllData(): void {
  shopService.reset();
  fixedCostService.reset();
  menuService.reset();
  scenarioService.reset();
}

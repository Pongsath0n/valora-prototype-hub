/**
 * Scenario draft persistence (FE-09).
 *
 * Stores ONLY owner-entered scenario assumptions (slider values, notes,
 * saved scenario snapshots). NEVER stores actual business data — actual
 * revenue, cost, gross profit, and overhead come exclusively from the
 * canonical backend endpoints (planning baseline, overhead expenses,
 * planning assumptions).
 *
 * localStorage key: `healholic:profit-planning:draft`
 *
 * This replaces the legacy scenario key from the old mock storage layer,
 * which was seeded with demo business figures. The new key is namespaced
 * under `healholic:` and contains only scenario drafts.
 */
import type { SavedScenario } from "./types";

const KEY = "healholic:profit-planning:draft";

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

/**
 * Scenario draft service. Persists owner-entered "what-if" scenario
 * snapshots only. No actual business data is stored here.
 *
 * Fields per saved scenario:
 * - id: number (local counter)
 * - name: string (auto-generated label)
 * - timestamp: string (display label)
 * - fixedCosts: number (owner-entered assumption)
 * - avgPrice: number (owner-entered assumption)
 * - avgCost: number (owner-entered assumption)
 * - daysOpen: number (owner-entered assumption)
 * - targetProfit: number (owner-entered assumption)
 * - notes: string (owner-entered memo)
 *
 * Purpose: allow the owner to save/load "what-if" scenario snapshots
 * without mutating backend actual business data.
 */
export const scenarioDraftService = {
  get(): SavedScenario[] {
    return load<SavedScenario[]>(KEY, []);
  },
  save(scenario: SavedScenario): void {
    const current = scenarioDraftService.get();
    const exists = current.findIndex((s) => s.id === scenario.id);
    if (exists >= 0) {
      current[exists] = scenario;
      save(KEY, current);
    } else {
      save(KEY, [scenario, ...current]);
    }
  },
  delete(id: number): void {
    save(
      KEY,
      scenarioDraftService.get().filter((s) => s.id !== id),
    );
  },
  nextId(): number {
    const items = scenarioDraftService.get();
    return items.length > 0 ? Math.max(...items.map((s) => s.id)) + 1 : 1;
  },
  reset(): void {
    save(KEY, []);
  },
};

import { describe, expect, it } from "vitest";
import {
  INGREDIENT_COST_TYPES,
  DEFAULT_INGREDIENT_COST_TYPE,
  isIngredientCostType,
  type IngredientCostType,
} from "../storeAdminApi";

describe("IngredientCostType helpers", () => {
  it("exposes the frozen DB enum values exactly", () => {
    expect(INGREDIENT_COST_TYPES).toEqual([
      "ingredient",
      "packaging",
      "consumable",
      "addon",
      "utility",
      "other",
    ]);
  });

  it("defaults to ingredient", () => {
    expect(DEFAULT_INGREDIENT_COST_TYPE).toBe("ingredient");
  });

  it("isIngredientCostType validates allowed values", () => {
    expect(isIngredientCostType("ingredient")).toBe(true);
    expect(isIngredientCostType("packaging")).toBe(true);
    expect(isIngredientCostType("consumable")).toBe(true);
    expect(isIngredientCostType("addon")).toBe(true);
    expect(isIngredientCostType("utility")).toBe(true);
    expect(isIngredientCostType("other")).toBe(true);
  });

  it("isIngredientCostType rejects unknown values", () => {
    expect(isIngredientCostType("machinery")).toBe(false);
    expect(isIngredientCostType("")).toBe(false);
    expect(isIngredientCostType("Ingredient")).toBe(false); // case-sensitive
  });

  it("IngredientCostType type compiles with allowed values", () => {
    const value: IngredientCostType = "packaging";
    expect(value).toBe("packaging");
  });
});

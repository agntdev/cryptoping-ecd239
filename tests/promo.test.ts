import { describe, expect, it } from "vitest";
import { recalculateOrderTotal, validatePromoDiscount } from "../src/store.js";

describe("promocode totals", () => {
  it("accepts only a positive discount up to 100 percent", () => {
    expect(validatePromoDiscount(0)).toBe(false);
    expect(validatePromoDiscount(10)).toBe(true);
    expect(validatePromoDiscount(100)).toBe(true);
    expect(validatePromoDiscount(100.01)).toBe(false);
  });

  it("rounds the discount and never produces a negative total", () => {
    expect(recalculateOrderTotal(123.45, 10)).toEqual({ discountAmount: 12.35, finalTotal: 111.1 });
    expect(recalculateOrderTotal(10, 100)).toEqual({ discountAmount: 10, finalTotal: 0 });
  });
});

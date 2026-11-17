import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiscount, computeTotals } from "../src/lib/money";

test("percent discount is floored and capped at subtotal", () => {
  assert.equal(computeDiscount(1950, { kind: "percent", value: 10 }), 195);
  assert.equal(computeDiscount(333, { kind: "percent", value: 10 }), 33);
  assert.equal(computeDiscount(100, { kind: "percent", value: 150 }), 100);
});

test("fixed discount cannot exceed subtotal", () => {
  assert.equal(computeDiscount(100, { kind: "fixed", value: 500 }), 100);
  assert.equal(computeDiscount(0, { kind: "fixed", value: 50 }), 0);
  assert.equal(computeDiscount(500, null), 0);
});

test("totals = subtotal - discount + delivery fee", () => {
  const t = computeTotals(
    [
      { unitPrice: 900, quantity: 2 },
      { unitPrice: 150, quantity: 1 },
    ],
    150,
    { kind: "percent", value: 10 },
  );
  assert.deepEqual(t, { subtotal: 1950, discount: 195, deliveryFee: 150, total: 1905 });
});

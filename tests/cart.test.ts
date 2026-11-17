import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCart, parseCart, clampQty } from "../src/lib/cart";

test("quantities are clamped to 1..50", () => {
  assert.equal(clampQty(0), 1);
  assert.equal(clampQty(999), 50);
  assert.equal(clampQty(2.5), 1);
});

test("adding the same service merges quantities", () => {
  let items = addToCart([], 1, 2, "");
  items = addToCart(items, 1, 3, "red wine stain");
  assert.deepEqual(items, [{ serviceId: 1, quantity: 5, careNotes: "red wine stain" }]);
});

test("cart cookie with garbage yields an empty cart", () => {
  assert.deepEqual(parseCart("not json"), []);
  assert.deepEqual(parseCart('{"a":1}'), []);
  assert.deepEqual(parseCart(undefined), []);
  assert.deepEqual(parseCart('[{"serviceId":"abc","quantity":2}]'), []);
});

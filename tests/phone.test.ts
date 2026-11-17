import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEthiopianMobile } from "../src/lib/phone";

test("accepts common Ethiopian mobile formats", () => {
  assert.equal(normalizeEthiopianMobile("0911234567"), "+251911234567");
  assert.equal(normalizeEthiopianMobile("+251 911 234 567"), "+251911234567");
  assert.equal(normalizeEthiopianMobile("251-911-234-567"), "+251911234567");
  assert.equal(normalizeEthiopianMobile("0711 234 567"), "+251711234567");
  assert.equal(normalizeEthiopianMobile("911234567"), "+251911234567");
});

test("rejects invalid numbers", () => {
  assert.equal(normalizeEthiopianMobile("12345"), null);
  assert.equal(normalizeEthiopianMobile("0311234567"), null);
  assert.equal(normalizeEthiopianMobile("+1 415 555 0100"), null);
  assert.equal(normalizeEthiopianMobile(""), null);
});

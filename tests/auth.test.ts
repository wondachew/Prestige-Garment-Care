import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkAdminPassword, issueAdminToken, verifyAdminToken, adminConfigured } from "../src/lib/auth";

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse battery";
  process.env.SESSION_SECRET = "x".repeat(40);
});

test("password check is exact", () => {
  assert.equal(checkAdminPassword("correct horse battery"), true);
  assert.equal(checkAdminPassword("correct horse"), false);
  assert.equal(checkAdminPassword(""), false);
});

test("issued token verifies until expiry", () => {
  const now = 1_000_000;
  const token = issueAdminToken(now);
  assert.equal(verifyAdminToken(token, now + 1000), true);
  assert.equal(verifyAdminToken(token, now + 13 * 3600 * 1000), false);
});

test("tampered, missing or malformed tokens are rejected", () => {
  const token = issueAdminToken(1_000_000);
  const [exp, sig] = token.split(".");
  assert.equal(verifyAdminToken(undefined), false);
  assert.equal(verifyAdminToken("garbage"), false);
  assert.equal(verifyAdminToken(`${Number(exp) + 999999}.${sig}`, 1_000_001), false);
  assert.equal(verifyAdminToken(`${exp}.${"0".repeat(sig.length)}`, 1_000_001), false);
});

test("token signed with another secret is rejected", () => {
  const token = issueAdminToken(1_000_000);
  process.env.SESSION_SECRET = "y".repeat(40);
  assert.equal(verifyAdminToken(token, 1_000_001), false);
});

test("admin is not configured without strong secret", () => {
  process.env.SESSION_SECRET = "short";
  assert.equal(adminConfigured(), false);
});

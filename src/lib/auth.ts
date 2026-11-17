import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "esc_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) && (process.env.SESSION_SECRET?.length ?? 0) >= 32;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return s;
}

/** Constant-time password comparison (hashes first so lengths never leak). */
export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sign(expiresAt: string): string {
  return createHmac("sha256", secret()).update(`admin.${expiresAt}`).digest("hex");
}

export function issueAdminToken(now = Date.now()): string {
  const expiresAt = String(now + SESSION_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifyAdminToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= now) return false;
  const expected = sign(expiresAt);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export const ADMIN_SESSION_MAX_AGE = SESSION_MS / 1000;

/** HMAC-SHA256 of a payload using SESSION_SECRET (used by customer sessions too). */
export function hmacSign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

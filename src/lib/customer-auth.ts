import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { hmacSign } from "./auth";

export const CUSTOMER_COOKIE = "esc_customer";
export const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function passwordError(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 200) return "Password is too long.";
  return null;
}

/** scrypt with a per-password random salt. Format: scrypt$<salt b64>$<key b64>. */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) {
    // Spend comparable time for unknown accounts so response timing does not reveal registration.
    scryptSync(pw, "timing-equaliser", 64);
    return false;
  }
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = scryptSync(pw, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function issueCustomerToken(customerId: number, now = Date.now()): string {
  const exp = String(now + CUSTOMER_SESSION_MS);
  return `${customerId}.${exp}.${hmacSign(`customer.${customerId}.${exp}`)}`;
}

/** Returns the customer id for a valid, unexpired token, otherwise null. */
export function verifyCustomerToken(token: string | undefined, now = Date.now()): number | null {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig || !/^\d+$/.test(id) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) <= now) return null;
  const expected = hmacSign(`customer.${id}.${exp}`);
  if (sig.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? Number(id) : null;
}

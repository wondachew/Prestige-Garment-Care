// Cart lives in a signed-free, server-validated cookie. Prices are NEVER taken from the cookie;
// they are re-read from the database when the order is placed.
export const CART_COOKIE = "esc_cart";
export const DISCOUNT_COOKIE = "esc_discount";
export const MAX_QTY = 50;
export const MAX_NOTE = 300;

export interface CartItem {
  serviceId: number;
  quantity: number;
  careNotes: string;
}

export function clampQty(n: number): number {
  if (!Number.isInteger(n)) return 1;
  return Math.min(MAX_QTY, Math.max(1, n));
}

export function parseCart(raw: string | undefined): CartItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .map((x) => ({
        serviceId: Number((x as CartItem).serviceId),
        quantity: clampQty(Number((x as CartItem).quantity)),
        careNotes: String((x as CartItem).careNotes ?? "").slice(0, MAX_NOTE),
      }))
      .filter((x) => Number.isInteger(x.serviceId) && x.serviceId > 0)
      .slice(0, 50);
  } catch {
    return [];
  }
}

export function serializeCart(items: CartItem[]): string {
  return JSON.stringify(items);
}

export function addToCart(items: CartItem[], serviceId: number, quantity: number, careNotes: string): CartItem[] {
  const note = careNotes.slice(0, MAX_NOTE);
  const existing = items.find((i) => i.serviceId === serviceId);
  if (!existing) return [...items, { serviceId, quantity: clampQty(quantity), careNotes: note }];
  return items.map((i) =>
    i.serviceId === serviceId
      ? { ...i, quantity: clampQty(i.quantity + quantity), careNotes: note || i.careNotes }
      : i,
  );
}

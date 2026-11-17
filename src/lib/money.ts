// All money is stored and calculated as whole Ethiopian Birr (ETB) integers.

export function formatEtb(amount: number): string {
  return `ETB ${new Intl.NumberFormat("en-US").format(Math.round(amount))}`;
}

export type Discount = { kind: "percent" | "fixed"; value: number } | null;
export interface PricedLine { unitPrice: number; quantity: number }
export interface Totals { subtotal: number; discount: number; deliveryFee: number; total: number }

export function computeDiscount(subtotal: number, discount: Discount): number {
  if (!discount || subtotal <= 0) return 0;
  const raw = discount.kind === "percent" ? Math.floor((subtotal * discount.value) / 100) : discount.value;
  return Math.max(0, Math.min(raw, subtotal));
}

export function computeTotals(lines: PricedLine[], deliveryFee: number, discount: Discount): Totals {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discountAmount = computeDiscount(subtotal, discount);
  return { subtotal, discount: discountAmount, deliveryFee, total: subtotal - discountAmount + deliveryFee };
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  CART_COOKIE,
  DISCOUNT_COOKIE,
  MAX_NOTE,
  addToCart,
  clampQty,
  parseCart,
  serializeCart,
  type CartItem,
} from "@/lib/cart";
import { createOrder, findDiscount, ValidationError } from "@/lib/orders";
import { getCurrentCustomer } from "@/lib/customer-guard";

const COOKIE_OPTS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 14,
};

async function readCart(): Promise<CartItem[]> {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

async function writeCart(items: CartItem[]): Promise<void> {
  (await cookies()).set(CART_COOKIE, serializeCart(items), COOKIE_OPTS);
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const serviceId = Number(formData.get("serviceId"));
  const quantity = clampQty(Number(formData.get("quantity") ?? 1));
  const careNotes = String(formData.get("careNotes") ?? "").trim().slice(0, MAX_NOTE);
  const exists = getDb().prepare("SELECT id FROM services WHERE id = ? AND active = 1").get(serviceId);
  if (!exists) redirect("/services?error=That+garment+is+not+available.");
  await writeCart(addToCart(await readCart(), serviceId, quantity, careNotes));
  redirect("/cart");
}

export async function changeCartLineAction(formData: FormData): Promise<void> {
  const serviceId = Number(formData.get("serviceId"));
  let items = await readCart();
  if (formData.get("intent") === "remove") {
    items = items.filter((i) => i.serviceId !== serviceId);
  } else {
    items = items.map((i) =>
      i.serviceId === serviceId
        ? {
            ...i,
            quantity: clampQty(Number(formData.get("quantity"))),
            careNotes: String(formData.get("careNotes") ?? "").trim().slice(0, MAX_NOTE),
          }
        : i,
    );
  }
  await writeCart(items);
  redirect("/cart");
}

export async function applyDiscountAction(formData: FormData): Promise<void> {
  const code = String(formData.get("discountCode") ?? "").trim().toUpperCase();
  const jar = await cookies();
  if (!code) {
    jar.delete(DISCOUNT_COOKIE);
    redirect("/cart");
  }
  if (!findDiscount(getDb(), code)) redirect("/cart?error=That+discount+code+is+not+valid.");
  jar.set(DISCOUNT_COOKIE, code, COOKIE_OPTS);
  redirect("/cart?ok=Discount+applied.");
}

export async function placeOrderAction(formData: FormData): Promise<void> {
  const jar = await cookies();
  const items = parseCart(jar.get(CART_COOKIE)?.value);
  const collectionAddress = String(formData.get("collectionAddress") ?? "");
  const deliverySame = formData.get("deliverySameAsCollection") === "on";
  const me = await getCurrentCustomer();
  let result: { orderNo: string; trackingToken: string };
  try {
    result = createOrder(getDb(), {
      customerName: String(formData.get("customerName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? "") || null,
      collectionAddress,
      zoneId: Number(formData.get("zoneId")),
      deliveryAddress: deliverySame ? collectionAddress : String(formData.get("deliveryAddress") ?? ""),
      collectionDate: String(formData.get("collectionDate") ?? ""),
      collectionWindow: String(formData.get("collectionWindow") ?? ""),
      deliveryDate: String(formData.get("deliveryDate") ?? "") || null,
      deliveryInstructions: String(formData.get("deliveryInstructions") ?? ""),
      paymentMethod: String(formData.get("paymentMethod") ?? ""),
      discountCode: String(formData.get("discountCode") ?? "") || jar.get(DISCOUNT_COOKIE)?.value || null,
      items: items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, careNotes: i.careNotes })),
      accountCustomerId: me?.id ?? null,
    });
  } catch (e) {
    if (e instanceof ValidationError) redirect(`/checkout?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  jar.delete(CART_COOKIE);
  jar.delete(DISCOUNT_COOKIE);
  redirect(`/order/${result.orderNo}?t=${result.trackingToken}`);
}

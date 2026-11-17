"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CUSTOMER_COOKIE, CUSTOMER_SESSION_MS, issueCustomerToken } from "@/lib/customer-auth";
import { requireCustomer } from "@/lib/customer-guard";
import { addAddress, deleteAddress, loginCustomer, registerCustomer } from "@/lib/accounts";
import { ValidationError } from "@/lib/orders";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: CUSTOMER_SESSION_MS / 1000,
};

export async function registerAction(formData: FormData): Promise<void> {
  let id: number;
  try {
    if (String(formData.get("password") ?? "") !== String(formData.get("confirm") ?? "")) {
      throw new ValidationError("The two passwords do not match.");
    }
    id = registerCustomer(getDb(), {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (e) {
    if (e instanceof ValidationError) redirect(`/account/register?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  (await cookies()).set(CUSTOMER_COOKIE, issueCustomerToken(id), COOKIE_OPTS);
  redirect("/account?ok=Welcome.+Your+account+is+ready.");
}

export async function loginAction(formData: FormData): Promise<void> {
  let id: number;
  try {
    id = loginCustomer(getDb(), String(formData.get("phone") ?? ""), String(formData.get("password") ?? ""));
  } catch (e) {
    if (e instanceof ValidationError) redirect(`/account/login?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  (await cookies()).set(CUSTOMER_COOKIE, issueCustomerToken(id), COOKIE_OPTS);
  redirect("/account");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(CUSTOMER_COOKIE);
  redirect("/");
}

export async function addAddressAction(formData: FormData): Promise<void> {
  const me = await requireCustomer();
  try {
    addAddress(getDb(), me.id, {
      label: String(formData.get("label") ?? ""),
      subCity: String(formData.get("subCity") ?? ""),
      building: String(formData.get("building") ?? ""),
      landmark: String(formData.get("landmark") ?? ""),
      addressText: String(formData.get("addressText") ?? ""),
    });
  } catch (e) {
    if (e instanceof ValidationError) redirect(`/account?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/account?ok=Address+saved.");
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const me = await requireCustomer();
  deleteAddress(getDb(), me.id, Number(formData.get("addressId")));
  redirect("/account?ok=Address+removed.");
}

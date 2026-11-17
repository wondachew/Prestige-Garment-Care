import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { CUSTOMER_COOKIE, verifyCustomerToken } from "./customer-auth";

export interface CurrentCustomer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
}

/** The signed-in customer, or null. Reads the signed cookie and loads the account. */
export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const id = verifyCustomerToken((await cookies()).get(CUSTOMER_COOKIE)?.value);
  if (!id) return null;
  const row = getDb()
    .prepare("SELECT id, name, phone, email FROM customers WHERE id = ? AND password_hash IS NOT NULL")
    .get(id) as CurrentCustomer | undefined;
  return row ?? null;
}

export async function requireCustomer(): Promise<CurrentCustomer> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/account/login");
  return me;
}

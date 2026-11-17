import type { Metadata } from "next";
import { adminConfigured } from "@/lib/auth";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <section>
      <div className="container" style={{ maxWidth: 440 }}>
        <p className="eyebrow">Owner &amp; staff</p>
        <h1>Sign in</h1>
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        {!adminConfigured() ? (
          <div className="alert error">Admin is not configured on this server. Set ADMIN_PASSWORD and SESSION_SECRET (32+ characters).</div>
        ) : null}
        <form action={loginAction} className="panel">
          <div className="field">
            <label htmlFor="password">Admin password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Sign in</button>
        </form>
      </div>
    </section>
  );
}

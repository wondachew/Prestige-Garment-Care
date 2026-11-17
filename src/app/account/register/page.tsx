import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <section>
      <div className="container" style={{ maxWidth: 480 }}>
        <p className="eyebrow">Your account</p>
        <h1>Create an account</h1>
        <p className="muted">Track orders, save collection addresses and manage your subscription in one place.</p>
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        <form action={registerAction} className="panel">
          <div className="field"><label htmlFor="name">Full name</label><input id="name" name="name" required minLength={2} autoComplete="name" /></div>
          <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="0911 234 567 or +251 911 234 567" /><small>Used to log in. Number verification by SMS will be added later.</small></div>
          <div className="field"><label htmlFor="email">Email <small>(optional)</small></label><input id="email" name="email" type="email" autoComplete="email" /></div>
          <div className="row2">
            <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /><small>At least 8 characters.</small></div>
            <div className="field"><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></div>
          </div>
          <button className="btn btn-gold" type="submit" style={{ width: "100%" }}>Create account</button>
        </form>
        <p className="muted">Already have an account? <Link href="/account/login">Log in</Link>.</p>
      </div>
    </section>
  );
}

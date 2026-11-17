import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <section>
      <div className="container" style={{ maxWidth: 440 }}>
        <p className="eyebrow">Your account</p>
        <h1>Log in</h1>
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        <form action={loginAction} className="panel">
          <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" name="phone" type="tel" required autoComplete="username" placeholder="0911 234 567" /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" /></div>
          <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Log in</button>
        </form>
        <p className="muted">New here? <Link href="/account/register">Create an account</Link>. Guest checkout is still available.</p>
      </div>
    </section>
  );
}

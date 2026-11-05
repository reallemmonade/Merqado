import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { safeReturnTo } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter your work email address.",
  no_connection: "Your firm hasn't set up Merqado sign-in yet. Ask your Merqado admin.",
  idp_unreachable: "We couldn't reach your firm's sign-in service. Try again in a minute.",
  idp_denied: "Sign-in was cancelled or denied by your firm's sign-in service.",
  expired: "Sign-in took too long. Try again.",
  no_email: "Your account didn't share a verified work email. Ask your IT team to include the email claim.",
  wrong_domain: "That account's email domain isn't allowed for this firm.",
  not_provisioned: "You don't have a Merqado seat yet. Ask your firm's Merqado admin to add you.",
  failed: "Sign-in failed. Try again, and contact support if it keeps happening.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  if (await getSessionUser(getDb())) redirect(safeReturnTo(sp.returnTo));
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.failed) : null;

  return (
    <main className="main" style={{ maxWidth: 440, margin: "10vh auto 0" }}>
      <div className="brand" style={{ color: "var(--ink)" }}>
        merqado
      </div>
      <section className="card">
        <h1 style={{ fontSize: 24 }}>Sign in</h1>
        <p className="muted" style={{ margin: 0 }}>
          Use your work email. We'll send you to your firm's sign-in page.
        </p>
        <form method="post" action="/api/auth/start" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            defaultValue={sp.email ?? ""}
            placeholder="you@yourfirm.com"
            required
          />
          <input type="hidden" name="returnTo" value={safeReturnTo(sp.returnTo)} />
          <button type="submit">Continue</button>
        </form>
        {error && (
          <p className="error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

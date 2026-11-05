import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { safeReturnTo } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/session";
import { enabledPlatformProviders, PLATFORM_PROVIDERS } from "@/lib/auth/platform";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter your work email address.",
  no_connection: "That sign-in option isn't available. Try another one.",
  firm_not_found: "Your firm isn't on Merqado yet. Ask your Merqado admin, or contact us to get started.",
  use_button: "Your firm signs in with Google or Microsoft. Use one of the buttons above.",
  personal_account: "Use your work account, not a personal Google or Microsoft account.",
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
  const returnTo = safeReturnTo(sp.returnTo);
  const providers = enabledPlatformProviders();

  return (
    <main className="main" style={{ maxWidth: 440, margin: "10vh auto 0" }}>
      <div className="brand" style={{ color: "var(--ink)" }}>
        merqado
      </div>
      <section className="card">
        <h1 style={{ fontSize: 24 }}>Sign in</h1>
        {providers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {providers.map((p) => (
              <form key={p} method="post" action="/api/auth/start">
                <input type="hidden" name="provider" value={p} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" className="secondary" style={{ width: "100%" }}>
                  Continue with {PLATFORM_PROVIDERS[p].label}
                </button>
              </form>
            ))}
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Or, if your firm uses its own sign-in (Okta, OneLogin, ...), enter your work email.
            </p>
          </div>
        )}
        {providers.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            Use your work email. We'll send you to your firm's sign-in page.
          </p>
        )}
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
          <input type="hidden" name="returnTo" value={returnTo} />
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

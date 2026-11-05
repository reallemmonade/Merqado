import type { Metadata } from "next";
import { PublicPage } from "@/components/PublicPage";

export const metadata: Metadata = { title: "Privacy policy · Merqado" };

const UPDATED = "5 November 2026";

export default function Privacy() {
  return (
    <PublicPage narrow>
      <article style={{ display: "flex", flexDirection: "column", gap: 12, lineHeight: 1.6, padding: "32px 0 48px" }}>
        <h1 style={{ fontSize: 32, margin: 0 }}>Privacy policy</h1>
        <p className="muted" style={{ margin: 0 }}>Last updated {UPDATED}</p>

        <p>
          Merqado is a workspace for consulting firms, operated by Guava Ventures (&ldquo;we&rdquo;). This policy explains
          what we collect when your firm uses Merqado, why, and the choices you have. Your firm is the customer and
          decides what client data goes into Merqado; for that data we act on your firm&rsquo;s instructions.
        </p>

        <h2 style={{ fontSize: 20 }}>What we collect</h2>
        <ul>
          <li>
            <b>Account details</b> from your work sign-in (Google, Microsoft or your firm&rsquo;s identity provider): your
            name, work email address and, for Microsoft, your organization&rsquo;s tenant ID. We do not receive or store
            your password.
          </li>
          <li>
            <b>Work content</b> your team adds: engagements, file names and metadata, findings, messages and questions.
            The files themselves stay in your firm&rsquo;s own cloud storage when your firm connects it.
          </li>
          <li>
            <b>Usage records</b>: sign-in sessions and, for each AI request, the model used and the number of tokens, so
            usage can be shown and billed.
          </li>
        </ul>

        <h2 style={{ fontSize: 20 }}>How we use it</h2>
        <p>
          Only to provide Merqado to your firm: to sign you in, show you the engagements you belong to, answer questions
          about your engagement data, generate documents you ask for, secure the service and bill your firm. We do not
          sell personal data, use it for advertising, or use your firm&rsquo;s content to train AI models.
        </p>

        <h2 style={{ fontSize: 20 }}>Google user data</h2>
        <p>
          When you continue with Google we request only your basic profile and email address (the openid, email and
          profile scopes) to identify you and confirm which firm you belong to. Merqado&rsquo;s use of information received
          from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
          including the Limited Use requirements.
        </p>

        <h2 style={{ fontSize: 20 }}>Who we share it with</h2>
        <ul>
          <li>People at your firm who are members of the same engagement.</li>
          <li>
            Service providers that run Merqado for us: hosting (Render), database (Turso) and, when your firm uses
            Merqado&rsquo;s managed AI, the AI model provider (Anthropic). If your firm connects its own AI model or
            storage, data goes to those providers under your firm&rsquo;s own agreements.
          </li>
          <li>Authorities, where the law requires it.</li>
        </ul>

        <h2 style={{ fontSize: 20 }}>Security and retention</h2>
        <p>
          Data is encrypted in transit, and stored credentials (such as AI or storage keys) are encrypted at rest. We keep
          account and work data for as long as your firm uses Merqado, and delete it when your firm asks or closes its
          account, apart from records we must keep by law.
        </p>

        <h2 style={{ fontSize: 20 }}>Your choices</h2>
        <p>
          You can ask to see, correct or delete your personal data. Because your firm controls its workspace, we may pass
          your request to your firm&rsquo;s Merqado admin. Contact us at{" "}
          <a href="mailto:maxam@guava.ventures">maxam@guava.ventures</a>.
        </p>

        <h2 style={{ fontSize: 20 }}>Changes</h2>
        <p>If we change this policy we will update the date above, and tell firm admins about significant changes.</p>
      </article>
    </PublicPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/PublicPage";

export const metadata: Metadata = {
  title: "Merqado: the engagement workspace for consulting teams",
  description:
    "Merqado keeps a consulting team's client data, findings and conversations in one place, answers questions from the data, and turns the storyline into a deck.",
};

const FEATURES = [
  ["One data room per engagement", "Files stay in your firm's own cloud storage. Merqado keeps track of what's there and what it says."],
  ["Ask the data", "Ask a question in plain language and get an answer with links back to the exact sources."],
  ["Findings with evidence", "Every finding is tied to the page, cell range or interview that backs it, so nothing goes in a deck unsupported."],
  ["Storyline to deck", "Arrange findings into the answer, then generate slides in your firm's template."],
  ["Your AI, your terms", "Use Merqado's AI, or connect your firm's own model account so data and billing stay with you."],
  ["Sign in with your work account", "Continue with Google or Microsoft, or your firm's own identity provider. No new passwords."],
] as const;

export default function Welcome() {
  return (
    <PublicPage>
      <section style={{ padding: "48px 0 24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
        <h1 className="serif" style={{ fontSize: 48, lineHeight: 1.1, margin: 0 }}>The engagement workspace for consulting teams</h1>
        <p className="muted" style={{ fontSize: 18, margin: 0, lineHeight: 1.5 }}>
          Merqado keeps an engagement's client data, findings and team conversation in one place, answers questions
          straight from the data, and turns your storyline into a deck.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="button" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Sign in
          </Link>
          <a href="mailto:maxam@guava.ventures?subject=Merqado" style={{ alignSelf: "center" }}>
            Talk to us
          </a>
        </div>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, paddingBottom: 48 }}>
        {FEATURES.map(([title, body]) => (
          <div key={title} className="card">
            <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              {body}
            </p>
          </div>
        ))}
      </section>
    </PublicPage>
  );
}

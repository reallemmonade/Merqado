@AGENTS.md

# Merqado rules for Claude

## UI copy
- No descriptions, helper text, subtitles or how-to notes anywhere in the app.
- No text that repeats what a chart or bar already shows.
- Keep only titles, labels, data, legends and buttons. Placeholders are one or two words; empty states are short ("No files").
- Public marketing and legal pages may have prose.

## Building features
- New screens or features: show 2 or 3 mockup options and wait for a pick before building. Small tweaks don't need mockups.
- Build only the chosen option.

## Brand
- Inter for UI and logo. Newsreader (`--font-serif`) for quotes, KTAs, slide titles and headlines.
- Main logo look is Orchid (#6a6fa3 → #9a4a96 → #d0267e); logo files live in `public/brand/`. Don't stretch or recolor them.
- App looks come from the Guava theme (`src/lib/guava/`).

## Case data privacy
- Identify a case by case code + project code name (e.g. "CASE001 · Project Atlas").
- Never put a client's real name in UI, file names, code, commits, PRs, seed data or demos. Real names may appear only inside quotes and the client deck.
- Never commit real case files. Tests and seeds use synthetic data with codes (Client, OEM nn, Person nn).

## Checks and merging
- Before pushing: `npm run typecheck`, `npm test`, `npm run build`.
- When asked to merge and CI is still running, run those checks locally, merge as soon as they pass, then keep watching main and fix any failure in a follow-up PR.
- Never skip or disable a test to get green.

## Talking to the user
- Short, plain, non-technical replies. Answer first, no filler or recaps.
- Do setup steps yourself where possible; otherwise give click-by-click steps with direct links.

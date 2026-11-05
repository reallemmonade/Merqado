# Merqado

The engagement workspace for consulting teams: client data, findings, team collaboration, and AI that answers from the engagement's own evidence.

This is the first scaffold. It has the data model, the connectors to a client's own AI model and cloud storage, a persona-aware app shell, file upload, and an Ask endpoint.

## Stack

- Next.js (App Router) + TypeScript, deployed on Render (`render.yaml`)
- Turso (libSQL) via Drizzle ORM; a local SQLite file in development
- Vitest for tests

## Run it locally

```bash
cp .env.example .env.local      # fill in MERQADO_SECRET_KEY; ANTHROPIC_API_KEY to try Ask
npm install
npm run db:migrate
npm run db:seed
DEV_USER_EMAIL=manager@demo.test npm run dev
```

Seeded users (all fictional): `partner@`, `manager@`, `consultant@`, `associate@demo.test`. Sign-in is a dev stub until SSO is added; it is disabled in production.

## How the pieces fit

**Personas.** Every firm maps its own titles (`firm_roles`) onto four archetypes: associate, consultant, manager, partner. The archetype picks the default home view (`src/lib/roles.ts`). Permissions come from per-engagement access (`viewer`, `editor`, `lead`), never from title.

**AI: the firm's model or ours.** A firm connects its own model account (`ai_providers`), or uses Merqado's. `firms.ai_billing_mode` decides who pays:

- `byo`: calls go to the firm's own Anthropic, Amazon Bedrock, Google Vertex AI, OpenAI, Azure OpenAI, or OpenAI-compatible endpoint. The firm's cloud bill covers the tokens.
- `managed`: calls use Merqado's key and are metered for billing.

Both modes write a row to `usage_events` for every call. Adapters live in `src/lib/ai/providers`; credentials are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`).

**Storage: files stay in the client's cloud.** `storage_connections` points at the firm's S3 (or S3-compatible), Azure Blob, or Google Cloud Storage. Merqado stores only metadata and object keys (`sources`). Adapters live in `src/lib/storage/providers`.

## Deploying to Render

1. Create a Turso database and token: `turso db create merqado` then `turso db tokens create merqado`.
2. In Render, create a Blueprint from this repo and fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `MERQADO_SECRET_KEY` (32 random bytes, base64). Keep that key safe: losing it makes saved credentials unreadable.
3. Migrations run in the pre-deploy step (`npm run db:migrate`), which needs a paid Render instance type.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Run unit tests |
| `npm run typecheck` | Type-check without emitting |
| `npm run db:generate` | Create a migration from `src/db/schema.ts` changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load the demo firm |

## Not built yet

SSO and real auth, admin screens for connecting AI and storage, document parsing and retrieval for Ask, findings editing, the storyline board, slide generation, SharePoint and Google Drive connectors.

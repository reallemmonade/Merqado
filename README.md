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

Seeded users (all fictional): `partner@`, `manager@`, `consultant@`, `associate@demo.test`. `DEV_USER_EMAIL` skips SSO in development only; production always requires SSO.

## How the pieces fit

**Personas.** Every firm maps its own titles (`firm_roles`) onto four archetypes: associate, consultant, manager, partner. The archetype picks the default home view (`src/lib/roles.ts`). Permissions come from per-engagement access (`viewer`, `editor`, `lead`), never from title.

**Sign-in: each firm's own SSO.** People enter their work email; its domain picks the firm's OpenID Connect connection (Microsoft Entra ID, Google Workspace, Okta, Auth0, OneLogin and most others). The flow uses PKCE, state and nonce checks, and the returned email must be on one of the connection's domains. First-time users are created with the firm's default title unless auto-provisioning is off. Sessions last 12 hours and are stored as SHA-256 hashes (`src/lib/auth`).

Set up a firm (creates it if new, and makes the given person an admin):

```bash
npm run sso:add -- --firm "Acme Consulting" --slug acme \
  --issuer https://login.microsoftonline.com/<tenant-id>/v2.0 \
  --client-id <app-id> --client-secret <secret> \
  --domains acme.com --admin-email jane@acme.com --admin-name "Jane Doe"
```

In the firm's identity provider, register a web app with redirect URI `https://<your-domain>/api/auth/callback` and scopes `openid email profile`.

**AI: the firm's model or ours.** A firm connects its own model account (`ai_providers`), or uses Merqado's. `firms.ai_billing_mode` decides who pays:

- `byo`: calls go to the firm's own Anthropic, Amazon Bedrock, Google Vertex AI, OpenAI, Azure OpenAI, or OpenAI-compatible endpoint. The firm's cloud bill covers the tokens.
- `managed`: calls use Merqado's key and are metered for billing.

Both modes write a row to `usage_events` for every call. Adapters live in `src/lib/ai/providers`; credentials are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`).

**Storage: files stay in the client's cloud.** `storage_connections` points at the firm's S3 (or S3-compatible), Azure Blob, or Google Cloud Storage. Merqado stores only metadata and object keys (`sources`). Adapters live in `src/lib/storage/providers`.

## Deploying to Render

1. Create a Turso database and token: `turso db create merqado` then `turso db tokens create merqado`.
2. In Render, create a Blueprint from this repo and fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `MERQADO_SECRET_KEY` (32 random bytes, base64). Names are case-sensitive. Keep the key safe: losing it makes saved credentials unreadable. Set `APP_URL` if you use a custom domain; otherwise Render's URL is used for SSO redirects.
   Build command: `npm ci && npm run build`. Start command: `npm run start`.
3. `npm run start` applies migrations before starting the server (`scripts/bootstrap.ts`), so no pre-deploy step is needed.
4. Sign-in. Merqado has two ways in:
   - **Continue with Google / Microsoft** (the default for client firms). Merqado owns one Google OAuth client (External audience) and one multi-tenant Microsoft Entra app, set with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`. Redirect URI for both: `<APP_URL>/api/auth/callback`. A firm claims its email domains (`firm_domains`); anyone with a verified work account on a claimed domain can sign in and gets the default title. Personal Gmail/Outlook accounts are rejected. Microsoft identity comes from the UPN, not the editable `email` claim.
   - **The firm's own identity provider** (Okta, OneLogin, a firm's own Entra app...), via `npm run sso:add`. People type their work email and are routed by domain.
   - `SSO_ADMIN_EMAIL` (plus optional `SSO_FIRM_NAME`, `SSO_DOMAINS`, `SSO_ADMIN_NAME`) creates the first firm, claims its domain and makes that email an admin on every start.

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
| `npm run sso:add` | Add a firm's SSO connection |

## Not built yet

SAML and SCIM (user sync), admin screens for connecting AI and storage, document parsing and retrieval for Ask, findings editing, the storyline board, slide generation, SharePoint and Google Drive connectors.

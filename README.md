# Revu

Client portals for agencies. Each client gets a login to review deliverables,
approve work and leave feedback.

Built with Next.js (App Router), TypeScript, Tailwind CSS, Clerk (auth +
organizations) and Supabase (Postgres, Storage, Realtime).

> **Status: Phase 1.** Auth, create-agency, staff invites, clients CRUD, landing
> page and the seed script are in place. The projects/deliverables board is
> Phase 2, the client portal and Realtime are Phase 3, billing and email are
> Phase 4. See `AGENTS.md` for architecture, the authorization model and the
> current open items.

## Setup

### 1. Install

```bash
npm install
```

### 2. Clerk

1. Create an application at <https://dashboard.clerk.com> (**Create
   application**). Use a **development** instance while you are building.
2. Open **API keys** (left sidebar) and copy both keys from **Quick Copy**:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — `pk_test_…`
   - `CLERK_SECRET_KEY` — `sk_test_…`
3. Enable organizations: **Organizations Settings → Enable Organizations**.
   "Membership optional" is fine; Revu decides who is staff.
4. Turn on the Supabase integration: open Clerk's *Connect with Supabase* page
   (<https://dashboard.clerk.com/setup/supabase>), activate the integration and
   copy the domain it shows — you need it in step 3. This adds the
   `role: authenticated` claim Supabase requires. (Manual equivalent: **Sessions
   → Customize session token → Claims**, add `role` = `authenticated`.)

In a hurry? `npx clerk@latest init` provisions a throwaway development instance.

### 3. Supabase

1. Create a project at <https://supabase.com/dashboard> and wait for it to
   finish provisioning.
2. Copy the project URL, the anon key and the service role key from **Project
   Settings → API** (or the **Connect** button on the project home).
   - `NEXT_PUBLIC_SUPABASE_URL` — `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — **server only**, never in the browser
3. Register Clerk as a third-party auth provider so request JWTs are Clerk
   session tokens: **Authentication → Sign In / Providers → Third-Party Auth →
   Add provider → Clerk**, and paste the Clerk domain/issuer from step 2.4
   (e.g. `https://your-app.clerk.accounts.dev`). Do this for the instance you are
   actually running; dev and prod issuers differ.
4. The project ref is the `<project-ref>` in your project URL — you need it in
   step 5.

### 4. Configure environment

```bash
cp .env.example .env.local
```

Fill in the Clerk and Supabase values. The rest of the names already have the
correct defaults. `SUPABASE_SERVICE_ROLE_KEY` is server only — never expose it to
the browser, never commit `.env.local`.

### 5. Apply the schema

Schema changes ship **only** as migration files, applied with the Supabase CLI:

```bash
npx supabase login                       # opens a browser / paste an access token
npx supabase link --project-ref <project-ref-from-step-3>
npm run verify:migration                 # optional: run the SQL locally first
npm run db:push
```

`npm run verify:migration` executes `supabase/migrations/*.sql` in a local WASM
Postgres and asserts the tables, Clerk claim handling, RLS isolation and the
column-level grant. It needs no credentials and is a fast pre-flight — but
`npm run db:push` is what actually ships the schema.

### 6. Seed demo data

```bash
SEED_ADMIN_EMAIL=you@youragency.com npm run seed
```

Creates a demo agency, a client, a project and three deliverables. Re-running
resets the demo project's deliverables. Set `SEED_CLIENT_CLERK_USER_ID` to link
the demo client to a Clerk user so you can sign in as that client.

### 7. Run

```bash
npm run dev
```

Open <http://localhost:3000>, create an account and set up your agency
(`/onboarding`). To exercise the client side of the portal, sign in as a second
Clerk user, add that user's email as a client under `/clients`, then set
`SEED_CLIENT_CLERK_USER_ID` (or use `/clients/[id] → grant portal access`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (must pass before a phase is done) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply migrations with `supabase db push` |
| `npm run verify:migration` | Execute the migrations in a local WASM Postgres and assert RLS |
| `npm run seed` | Seed the demo agency, client, project and deliverables |

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/` | public | Landing page |
| `/sign-in`, `/sign-up` | public | Clerk auth |
| `/onboarding` | signed in, not provisioned | Create or activate an agency |
| `/dashboard` | staff | Overview, counts, activity |
| `/clients`, `/clients/[id]` | staff | Clients CRUD and portal access |
| `/projects` | staff | Project list and creation |
| `/projects/[id]` | staff | Deliverables board: files, status, comments |
| `/api/assets/[id]/download` | staff or owning client | 302 to a five-minute signed URL; 404 otherwise |
| `/team` | staff | Members and invitations (admins can invite) |
| `/settings` | staff admin | Agency name, slug, logo URL, brand colour |
| `/portal` | client | Branded portal: every project and its approval progress |
| `/portal/projects/[id]` | client | Review files, approve, request changes, comment |

## Security model in one paragraph

Staff are members of a Clerk Organization and can read and write everything
inside their own agency. Clients are plain Clerk users who are never added to
the organization; they can read their agency's projects, deliverables, assets
and comments, and can write only comments and a deliverable's status. Every
server action resolves the actor and asserts access in `src/lib/authz.ts` before
touching data, and all writes use the Supabase service role key server-side.
Row Level Security is enabled as defence-in-depth for anything using the anon
key — including the Realtime stream, which is filtered by those same policies.
Deliverable files live in a private bucket and are only ever handed out as
short-lived signed links after the same checks.

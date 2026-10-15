<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Revu

Client portal SaaS. An agency signs up, gets a workspace, adds clients, and each
client gets a login to review deliverables, approve work and comment.

## Stack

| Concern | Choice | Version |
| --- | --- | --- |
| Framework | Next.js App Router | 16.4.0 |
| UI | React, Tailwind CSS v4 | 19.3.0, 4.x |
| Auth / orgs | Clerk | `@clerk/nextjs` 7.9.15 (Core 3) |
| Database | Supabase Postgres | `@supabase/supabase-js` 2.117.x |
| Storage | Supabase Storage, private `assets` bucket (Phase 2) | — |
| Realtime | Supabase Realtime (Phase 3) | — |
| Email | Resend (Phase 4) | — |
| Payments | Dodo Payments (Phase 4) | — |

## Framework notes that will bite you if you assume older Next.js

- **Middleware is now `proxy.ts`.** `src/proxy.ts` holds `clerkMiddleware()`.
  `middleware.ts` still works but is deprecated. Read
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **Cache Components is on** (`cacheComponents: true` and
  `partialPrefetching: true` in `next.config.ts`). Reading the session is a
  request-time read, so it must sit behind a Suspense boundary. `src/app/layout.tsx`
  provides one around `{children}` for the whole app; that boundary is what gives
  every route a static shell and keeps `next build` clean.
- **Route segment config.** `export const instant` only affects *development*
  validation; the build is unaffected. If static-shell validation ever complains
  about a route, the sanctioned fix is `export const instant = false` on the
  lowest layout/page that covers it.
- **`LayoutProps<"/...">` / `PageProps<"/...">`** come from generated route types
  in `.next/types`. `npm run typecheck` runs `tsc` without those, so props are
  written out explicitly rather than relying on the generated helpers.
- **Prerendered pages are Partial Prerender.** Auth redirects happen inside the
  streamed segment, so a signed-out `GET /dashboard` returns 200 with the shell
  and the redirect to `/sign-in` in the RSC payload. That is expected.

## Framework notes for Clerk Core 3

- `<SignedIn>`, `<SignedOut>` and `<Protect>` were **removed** in
  `@clerk/nextjs` v7. Use `<Show when="signed-in">`, `<Show when="signed-out">`
  and `<Show when={{ role: "org:admin" }}>`. Rendering the old components throws.
- `<Show>` is an async server component that reads the session, so it needs a
  Suspense boundary above it — the root layout supplies one.
- `clerkMiddleware()` lives in `src/proxy.ts` (Next 16 naming).
- Server helpers come from `@clerk/nextjs/server`: `await auth()`,
  `await currentUser()`, `await clerkClient()`. `auth()` returns
  `{ userId, orgId, orgRole, orgSlug, sessionClaims, has, isAuthenticated, protect }`.
- There is **no** backend API to set a session's active organization. Activating
  an organization is a client-side operation (`useClerk().setActive`), which is
  why creating an agency is a two-step handshake — see
  `src/app/onboarding/create-agency-form.tsx`.

## Authorization — the core of the product

Everything lives in **`src/lib/authz.ts`**. Treat it as load-bearing: only add
helpers there, following the existing patterns, and never branch on Clerk state
anywhere else.

Two kinds of people:

- **Staff** — a member of the agency's Clerk Organization. Their `orgId` matches
  `agencies.clerk_org_id`. Roles are `org:admin` / `org:member`, mapped to
  owner/admin/member (`CLERK_ORG_ROLE_TO_STAFF_ROLE`).
- **Client** — a plain Clerk user who is **never** added to the organization.
  They are linked by the `clients` row whose `clerk_user_id` matches theirs.

Rules implemented:

| | Read | Write |
| --- | --- | --- |
| Staff | everything in their own agency | everything in their own agency |
| Client | their agency's projects, deliverables, assets, comments | comments and deliverable `status` only |

Mechanics:

- `getActorState()` resolves a memoized tri-state: `signed-out`, `no-actor`
  (signed in but not provisioned) or `actor`. `requireActor()` sends the first to
  `/sign-in` and the second to `/onboarding`.
- `requireStaff()` / `requireClient()` / `requireStaffAdmin()` are the route
  guards. A client hitting an agency route is redirected to `/portal`.
- **Resource assertions** are the only sanctioned way to reach a row from a
  server action: `requireProjectReadable`, `requireProjectWritableByStaff`,
  `requireDeliverableReadable`, `requireDeliverableWritableByStaff`,
  `requireDeliverableStatusWritable`, `requireCommentWritable`,
  `requireClientReadable`, `requireClientWritable`, `requireAssetReadable`,
  `requireAssetWritableByStaff`. They throw `NotFoundError` / `ForbiddenError`
  rather than leaking existence.
- **Every write uses the service role key** (`src/lib/supabase/admin.ts`), which
  bypasses RLS. The assertions above therefore *are* the primary control.
- The browser client (`src/lib/supabase/client.ts`) uses the anon key only.

### How a client gets access

Agencies add clients by email before that person has an account, so
`clients.clerk_user_id` starts null. The first time someone signs in, Revu
claims the row for them if Clerk reports their **primary email as verified** and
exactly one unlinked row matches (`claimClientRowByVerifiedEmail` in
`src/lib/authz.ts`). Emails are normalised to lowercase on write for this reason.

Consequences worth knowing:

- Two agencies can add the same address; the user is linked to the
  oldest matching row and the other is left untouched. Multi-agency clients are
  out of scope for v1.
- Revoking portal access sets `clerk_user_id` back to null; the projects stay.

## Database

Schema changes happen **only** through a new numbered file in
`supabase/migrations/`, applied with `supabase db push` (`npm run db:push`).
Never click through the dashboard and never run ad-hoc SQL.

- `src/lib/constants.ts` mirrors the CHECK constraints. Change both together.
- Indexes exist on every FK column.
- `projects` has a composite FK `(agency_id, client_id) → clients(agency_id, id)`
  so a project can never reference another agency's client.
- `plan` is constrained to `free | starter | unlimited`. `starter` ($29/mo, up to
  5 clients) and `unlimited` ($79/mo) are the Phase 4 tiers.
- `status` values: projects `pending | active | in_review | complete | archived`,
  deliverables `pending | approved | changes_requested`.
- Migrations so far: `0001_init` (tables, indexes, RLS),
  `0002_phase2_assets` (private bucket + `storage.objects` policies),
  `0003_phase3_realtime` (Realtime publication). New schema goes in `0004_*`.

### Row Level Security

RLS is enabled on every table with policies built on Clerk's Supabase JWT
integration: helper functions read the request JWT claims and compare
`sub` (Clerk user id) and the active organization id.

**Both session-token claim shapes are supported.** Clerk's older "version 1"
claims are flat (`org_id`, `org_role: 'org:admin'`); current instances also emit
"version 2", where the organization is a compact object (`o.id`, `o.rol:
'admin'`). `public.current_clerk_org_id()` and `public.current_clerk_org_role()`
read either and normalise the role to the v1 spelling, so no policy change is
needed if an instance switches version.

> **Required Supabase setup.** Add Clerk as a third-party auth provider in
> Supabase (**Authentication → Sign In / Providers → Third-Party Auth → Add
> provider → Clerk**, pasting the Clerk instance's Frontend API URL / issuer, or
> use Clerk's *Connect with Supabase* page which activates the integration and
> reveals the domain) so request JWTs are Clerk session tokens carrying
> `role: authenticated`. Keep `sub` and the organization claims enabled.

RLS is **defence-in-depth only**. Because the app writes with the service role,
RLS never runs for app traffic; it protects the anon key if it is ever used
directly. It is not yet a second line of enforcement to rely on.

One deliberate subtlety: RLS cannot restrict columns, so
`grant update (status) on public.deliverables to authenticated` (after revoking
table-level UPDATE) is what stops a client session from retitling or re-parenting
a deliverable. This relies on Supabase's default table grants to
`anon` / `authenticated` existing; `npm run verify:migration` reproduces those
defaults, so it exercises the same path.

### Storage

Deliverable files live in one **private** bucket, `assets`
(`20260201000000_phase2_assets.sql`). Nothing in it has a public URL.

- Object keys are `<agency_id>/<project_id>/<deliverable_id>/<random>-<name>`
  (`buildStoragePath` in `src/lib/storage.ts`). The layout is load-bearing: the
  `storage.objects` policies recover the owning agency from segment 1 and the
  deliverable from segment 3, so **changing the key shape means changing the
  migration too**. `public.revu_try_uuid()` keeps a malformed segment from
  raising inside a policy.
- Uploads and deletes go through the service role. Reads never do: the only way
  a file leaves Revu is `GET /api/assets/:id/download`, a route handler that
  resolves the actor, runs `requireAssetReadable`, then 302s to a **five-minute
  signed URL** with `Content-Disposition: attachment`. It returns 404 for a
  signed-out visitor so file ids are not probeable, and the response is
  `no-store`.
- 50 MiB per object, matching the bucket's `file_size_limit`.

### Realtime

Wired up in Phase 3 (`20260301000000_phase3_realtime.sql` — publishes
`deliverables` and `comments` to `supabase_realtime`, idempotently).

- The client subscribes with `postgres_changes` through `supabaseBrowser()`
  after handing the Clerk session token to `realtime.setAuth()`. Supabase
  validates that token with the same third-party auth integration the rest of
  RLS uses, so the stream is filtered by policy: a client session cannot receive
  a row it could not `select`.
- **Documented fallback.** `src/components/use-live-changes.ts` treats a missing
  token, a `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` status, a thrown subscribe, or a
  handshake that never completes within 6s as "Realtime is unavailable" and
  switches to polling (5–6s for a comment thread, 15s for deliverable status
  via `router.refresh()`). The UI shows which mode it is in — it never claims to
  be live when it is polling. This is the decision the Phase 1 note left open: no
  RLS policy was weakened to make Realtime work, and a session that Realtime
  rejects still gets correct, if slower, updates.
- **Not verified end to end** — it needs a real Clerk instance issuing Supabase
  session tokens and a linked Supabase project. See *Open items*.

## Environment variables

Copy `.env.example` to `.env.local`. Names:

| Variable | Scope | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | public | Clerk frontend |
| `CLERK_SECRET_KEY` | server | Clerk backend API |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | public | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | public | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | public | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | public | `/onboarding` |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | browser client (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | all writes; bypasses RLS |
| `NEXT_PUBLIC_APP_URL` | public | absolute origin |
| `SEED_CLERK_ORG_ID` | seed only | attach the demo agency to an existing org |
| `SEED_ADMIN_EMAIL` | seed only | invite this address as `org:admin` |
| `SEED_CLIENT_CLERK_USER_ID` | seed only | link the demo client to a Clerk user |
| `RESEND_API_KEY` | Phase 4 | transactional email |
| `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET` | Phase 4 | billing |
| `CRON_SECRET` | Phase 4 | weekly digest cron |

A `.env.local` containing **clearly-marked placeholder** values is present in the
working copy so `npm run build` runs before a Clerk/Supabase project exists.
Replace every value with real credentials to run the app.

## Commands

```bash
npm run dev               # dev server
npm run build             # must pass before a phase is called done
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
npm run db:push           # supabase db push — the only way schema ships
npm run verify:migration  # execute the migrations in local PGlite + assert RLS
npm run seed              # demo agency / client / project / deliverables
```

`npm run verify:migration` runs `supabase/migrations/*.sql` against PGlite (real
Postgres compiled to WASM), stubbing the Supabase-provided roles **and the
Supabase Storage schema** (`storage.buckets`, `storage.objects`,
`storage.foldername`), then asserts:

- 7 tables and every migration executes;
- both Clerk claim shapes resolve;
- RLS isolates one agency from another, and `authenticated` can update only
  `deliverables.status`;
- the `assets` bucket is private, and the `storage.objects` policies give a
  client their own agency's files and nobody else's (staff and client checked
  separately);
- `deliverables` and `comments` are published to `supabase_realtime`;
- every migration after 0001 is safe to re-run, because `db push` can be retried.

It is a pre-flight check, not a substitute for `supabase db push` on the real
project.

## Progress

### Phase 1 — complete in code, not yet applied to a database

- Clerk auth: `src/proxy.ts`, `ClerkProvider` in the root layout, `/sign-in`,
  `/sign-up`.
- Landing page at `/`.
- Create-agency: `/onboarding` → Clerk Organization + `agencies` row, then
  client-side organization activation.
- Staff invite: `/team` (members, pending invitations, invite, revoke) through
  Clerk organization invitations.
- Clients CRUD: `/clients` (list + add), `/clients/[id]` (edit, portal access,
  revoke, delete).
- Agency settings: `/settings` (name, slug, brand colour).
- Seed script: `scripts/seed.mts`.
- `AGENTS.md` (this file), `README.md`, `.env.example`.

**Blocked:** `supabase db push` has not run yet — see *Open items*.

### Phase 2 — projects + deliverables board (complete in code)

- `/projects` — create a project (client picker limited to your own clients),
  list every project with status and deliverable count.
- `/projects/[id]` — the board: deliverables grouped into **Pending review /
  Changes requested / Approved**, per-deliverable brief, files, status
  transitions, inline edit and delete, and a comment thread.
- Uploads into the private `assets` bucket with a 50 MiB cap; deletes remove both
  the row and the object.
- Downloads via the signed-URL route handler described under *Storage*.
- `/clients/[id]` links through to each project board.

New helpers only, as required: `requireAssetReadable` and
`requireAssetWritableByStaff` were added to `src/lib/authz.ts` alongside the
project/deliverable assertions that already existed. No Clerk middleware change.

### Phase 3 — client portal, comments, realtime (complete in code)

- `/portal` — branded with the agency's `logo_url` and `brand_color`
  (`src/app/portal/portal-shell.tsx`), one card per project with an approval
  progress bar and every deliverable's current state.
- `/portal/projects/[id]` — the review page: files, Approve / Request changes,
  and a comment thread per deliverable.
- Client writes are exactly two actions in `src/app/portal/actions.ts` —
  `setDeliverableStatusAction` and `addCommentAction` — each starting with
  `requireClient()` then the matching assertion.
- Comment author names are resolved server-side (`src/lib/comments.ts`): the
  `clients` row for client authors, one Clerk `getUserList` call for staff.
  Comments are stamped with the role derived from the actor, never a form field.
- `/settings` gained a **logo URL** field (https only; empty falls back to a
  monogram) so the branding in the portal is actually settable.
- Live updates as described under *Realtime*.

### Phase 4 — Dodo Payments, Resend, polish (not started)

## Open items

1. **`supabase db push` has not been run.** Three migrations are pending
   (`0001_init`, `0002_phase2_assets`, `0003_phase3_realtime`). It fails in this
   environment with:

   ```
   Cannot find project ref. Have you run supabase link?
   ```

   and `supabase projects list` reports:

   ```
   Access token not provided. Supply an access token by running `supabase login`
   or setting the SUPABASE_ACCESS_TOKEN environment variable.
   ```

   None of them has **been applied to a Supabase project**, so nothing that
   depends on them can be tested end to end. They *have* been executed locally:
   `npm run verify:migration` runs all three in PGlite (real Postgres) with the
   Supabase roles and Storage schema stubbed, and passes — 7 tables, both Clerk
   claim shapes resolving, RLS isolating one agency from another,
   `authenticated` able to update only `deliverables.status`, a private `assets`
   bucket whose policies isolate files per agency, and `deliverables` +
   `comments` published to `supabase_realtime`. That is execution, but not
   against Supabase's own auth schema — these helpers read
   `request.jwt.claims` directly rather than through `auth.jwt()`, so the local
   run does cover them. Apply with `npm run db:push` before relying on it.
2. Clerk and Supabase keys are placeholders. Sign-in, the dashboard, the board,
   uploads, the portal and Realtime cannot be exercised until real credentials
   are in `.env.local`. What *has* been checked against a running server: every
   route compiles and renders its static shell, and
   `GET /api/assets/<uuid>/download` returns a bare `404` to a signed-out
   request — no existence leak. Everything else is unverified at runtime.
3. Clerk Core 3 also affects the Supabase integration: confirm which
   session-token claim version your instance issues. The helpers handle both, but
   the Supabase provider still needs the `role: authenticated` claim, and a
   development Clerk instance is a different issuer from production.
4. `src/lib/types.ts` is hand-written. Regenerate with
   `npx supabase gen types typescript --linked > src/lib/database.types.ts`
   once the project is linked.

## Out of scope (do not build)

Invoicing, time tracking, Gantt views, custom domains, role editors, mobile apps.

## Conventions

- Server actions live in `actions.ts` next to the route that uses them and start
  with `await requireStaff()` / `requireClient()` / an assertion.
- Forms are client components using `useActionState`, returning
  `{ error?, success? }`; the shared `<SubmitButton>` shows pending state.
- After a mutation, `revalidatePath` the affected routes and record an entry in
  `activity` through `recordActivity`.
- UI primitives live in `src/components/ui.tsx`; status badges come from
  `src/components/status-badge.tsx` so the board and the portal cannot drift.
- Form values are normalised with `src/lib/form.ts` before they reach a query —
  a `FormDataEntryValue` is never trusted for shape or length.
- Anything both the board and the portal render (comment thread, activity
  names, deliverables) lives in `src/components/` or `src/lib/`, never
  duplicated per route.

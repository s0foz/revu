// Local schema verification (not part of the app build).
//   npm run verify:migration
// Runs supabase/migrations/*.sql in PGlite (real Postgres compiled to WASM)
// after stubbing the Supabase roles the migration expects, then asserts:
//   1. every migration executes without error
//   2. all 7 tables exist
//   3. the Clerk JWT helpers read BOTH v1 (org_id/org_role) and
//      v2 (o.id / o.rol) session-token claims
//   4. RLS actually filters rows when a non-owner session runs a query
//   5. Phase 2: the `assets` bucket is private and the storage.objects policies
//      resolve the owning agency / deliverable from the object key
//   6. Phase 3: comments and deliverables are published to supabase_realtime
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dir = "supabase/migrations";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const db = new PGlite();

// --- stub the pieces Supabase provides -------------------------------------
await db.exec(`
  do $$ begin
    create role anon nologin noinherit;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role authenticated nologin noinherit;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role service_role nologin noinherit bypassrls;
  exception when duplicate_object then null; end $$;

  -- Supabase grants table privileges to anon/authenticated by default; RLS then
  -- does the row filtering. Reproduce that here so the policies are exercised.
  alter default privileges in schema public
    grant select, insert, update, delete on tables to anon, authenticated;

  -- ---- the parts of Supabase Storage the migrations target ------------------
  -- Supabase ships a storage schema with buckets and objects plus the
  -- storage.foldername() helper. Recreate the columns the migrations touch so
  -- the bucket row and the object policies are actually created and evaluated.
  create schema if not exists storage;

  create table if not exists storage.buckets (
    id                 text primary key,
    name               text not null,
    public             boolean not null default false,
    file_size_limit    bigint,
    allowed_mime_types text[]
  );

  create table if not exists storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text references storage.buckets (id),
    name       text not null,
    owner      uuid,
    created_at timestamptz not null default now()
  );

  -- Everything except the final path segment, matching Supabase's helper.
  create or replace function storage.foldername(p_name text)
  returns text[]
  language sql
  immutable
  as $$
    select case
      when array_length(string_to_array(p_name, '/'), 1) > 1
      then (string_to_array(p_name, '/'))[1:array_length(string_to_array(p_name, '/'), 1) - 1]
      else '{}'::text[]
    end;
  $$;

  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;

  -- Supabase enables Realtime by publishing tables to this publication;
  -- alter publication ... add table needs it to exist.
  do $$ begin
    create publication supabase_realtime;
  exception when duplicate_object then null; end $$;
`);

for (const f of files) {
  const sql = readFileSync(`${dir}/${f}`, "utf8");
  await db.exec(sql);
  console.log(`✓ executed ${f}`);
}

const { rows: tables } = await db.query(`
  select tablename from pg_tables where schemaname = 'public' order by tablename
`);
const names = tables.map((t) => t.tablename);
console.log("tables:", names.join(", "));
if (names.length !== 7) throw new Error(`expected 7 tables, got ${names.length}`);

// --- Clerk claim helpers: v1 and v2 shapes ---------------------------------
const cases = [
  {
    label: "v1 flat claims",
    claims: { sub: "user_1", org_id: "org_1", org_role: "org:admin" },
    org: "org_1",
    role: "org:admin",
  },
  {
    label: "v2 compact claims",
    claims: { sub: "user_2", o: { id: "org_2", rol: "member", slg: "acme" } },
    org: "org_2",
    role: "org:member",
  },
  {
    label: "v2 compact admin",
    claims: { sub: "user_3", o: { id: "org_3", rol: "admin" } },
    org: "org_3",
    role: "org:admin",
  },
  { label: "no org context", claims: { sub: "user_4" }, org: null, role: "" },
];

for (const c of cases) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(c.claims),
  ]);
  const { rows } = await db.query(`
    select public.current_clerk_user_id() as uid,
           public.current_clerk_org_id()  as org,
           public.current_clerk_org_role() as role
  `);
  const got = rows[0];
  const ok = got.org === c.org && got.role === c.role;
  console.log(
    `${ok ? "✓" : "✗"} ${c.label}: sub=${got.uid} org=${got.org} role=${got.role}`,
  );
  if (!ok) throw new Error(`${c.label}: expected org=${c.org} role=${c.role}`);
}

// --- RLS: a v2-claim org admin must see its own agency, not another's ------
const idA = "11111111-1111-1111-1111-111111111111";
const idB = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  insert into public.agencies (id, clerk_org_id, name, slug, plan)
  values ('${idA}', 'org_2', 'Acme', 'acme', 'free'),
         ('${idB}', 'org_999', 'Globex', 'globex', 'free');
  grant usage on schema public to authenticated;
`);

await db.query(`select set_config('request.jwt.claims', $1, false)`, [
  JSON.stringify({ sub: "user_2", o: { id: "org_2", rol: "admin" } }),
]);
// NB: SET LOCAL only lives inside a transaction block, so use SET ROLE.
await db.exec(`set role authenticated`);
const { rows: visible } = await db.query(`select name from public.agencies`);
await db.exec(`reset role`);
console.log(
  `✓ RLS with v2 claims: authenticated sees [${visible.map((r) => r.name)}]`,
);
if (visible.length !== 1 || visible[0].name !== "Acme") {
  throw new Error("RLS did not isolate the agency for the v2 org claim");
}

// --- column-level grant: client sessions may only update `status` ----------
const { rows: updatable } = await db.query(`
  select column_name from information_schema.column_privileges
  where grantee = 'authenticated' and table_name = 'deliverables'
    and privilege_type = 'UPDATE'
  order by column_name
`);
console.log(
  `✓ authenticated UPDATE on deliverables limited to: ${updatable
    .map((r) => r.column_name)
    .join(", ")}`,
);
if (updatable.length !== 1 || updatable[0].column_name !== "status") {
  throw new Error("deliverables UPDATE grant is not restricted to status");
}

// --- Phase 2: the assets bucket is private and keyed by agency --------------
const { rows: buckets } = await db.query(`
  select id, public, file_size_limit from storage.buckets where id = 'assets'
`);
const bucket = buckets[0];
console.log(
  `✓ assets bucket: public=${bucket?.public} limit=${bucket?.file_size_limit}`,
);
if (!bucket) throw new Error("the `assets` bucket was not created");
if (bucket.public !== false) throw new Error("the `assets` bucket is not private");

const { rows: objectPolicies } = await db.query(`
  select policyname from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
  order by policyname
`);
console.log(
  `✓ storage.objects policies: ${objectPolicies.map((p) => p.policyname).join(", ")}`,
);
if (objectPolicies.length < 4) {
  throw new Error(`expected 4 storage.objects policies, got ${objectPolicies.length}`);
}

// A malformed object key must not raise inside policy evaluation.
const { rows: tryUuid } = await db.query(`
  select public.revu_try_uuid('not-a-uuid') as bad,
         public.revu_try_uuid('${idA}') as good
`);
if (tryUuid[0].bad !== null || tryUuid[0].good !== idA) {
  throw new Error("revu_try_uuid did not behave as a safe cast");
}
console.log("✓ revu_try_uuid returns null for a malformed path segment");

// --- Phase 2 RLS: a client sees only the files of their own agency ----------
const clientA = "33333333-3333-3333-3333-333333333333";
const projectA = "44444444-4444-4444-4444-444444444444";
const delivA = "55555555-5555-5555-5555-555555555555";
const projectB = "66666666-6666-6666-6666-666666666666";
const clientB = "77777777-7777-7777-7777-777777777777";
const delivB = "88888888-8888-8888-8888-888888888888";
const keyA = `${idA}/${projectA}/${delivA}/brief.pdf`;
const keyB = `${idB}/${projectB}/${delivB}/brief.pdf`;

await db.exec(`
  insert into public.clients (id, agency_id, clerk_user_id, name, email)
  values ('${clientA}', '${idA}', 'user_client_a', 'Dana', 'dana@acme.example'),
         ('${clientB}', '${idB}', 'user_client_b', 'Sam', 'sam@globex.example');

  insert into public.projects (id, agency_id, client_id, title)
  values ('${projectA}', '${idA}', '${clientA}', 'Acme site'),
         ('${projectB}', '${idB}', '${clientB}', 'Globex site');

  insert into public.deliverables (id, project_id, title)
  values ('${delivA}', '${projectA}', 'Homepage'),
         ('${delivB}', '${projectB}', 'Homepage');

  insert into storage.objects (bucket_id, name) values
    ('assets', '${keyA}'),
    ('assets', '${keyB}');
`);

async function objectsVisibleTo(claims) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(claims),
  ]);
  await db.exec(`set role authenticated`);
  const { rows } = await db.query(`select name from storage.objects order by name`);
  await db.exec(`reset role`);
  return rows.map((r) => r.name);
}

const seenByClient = await objectsVisibleTo({ sub: "user_client_a" });
console.log(
  `✓ storage RLS as client of Acme: [${seenByClient.map((n) => n.split("/").pop())}]`,
);
if (seenByClient.length !== 1 || seenByClient[0] !== keyA) {
  throw new Error("storage RLS leaked another agency's object to a client");
}

const seenByGlobexStaff = await objectsVisibleTo({
  sub: "user_2",
  org_id: "org_999",
  org_role: "org:admin",
});
console.log(
  `✓ storage RLS as Globex staff: [${seenByGlobexStaff.map((n) => n.split("/").pop())}]`,
);
if (seenByGlobexStaff.length !== 1 || seenByGlobexStaff[0] !== keyB) {
  throw new Error("storage RLS leaked another agency's object to staff");
}

// Reset the claims so nothing downstream inherits a session.
await db.query(`select set_config('request.jwt.claims', '', false)`);

// --- Phase 3: Realtime streams the client-facing tables --------------------
const { rows: published } = await db.query(`
  select tablename from pg_publication_tables
  where pubname = 'supabase_realtime'
  order by tablename
`);
const publishedNames = published.map((row) => row.tablename);
console.log(`✓ published to supabase_realtime: ${publishedNames.join(", ")}`);
for (const table of ["comments", "deliverables"]) {
  if (!publishedNames.includes(table)) {
    throw new Error(`${table} is not published to supabase_realtime`);
  }
}

// Every migration after the initial one must be safe to re-run, because
// `supabase db push` can be retried. (0001 creates the tables, so it is
// intentionally one-shot.)
for (const f of files.slice(1)) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
}
const { rows: publishedAgain } = await db.query(`
  select tablename from pg_publication_tables
  where pubname = 'supabase_realtime'
  order by tablename
`);
if (publishedAgain.length !== publishedNames.length) {
  throw new Error("re-running the migrations changed the realtime publication");
}
console.log("✓ re-running the later migrations is idempotent");

console.log("\nALL MIGRATION CHECKS PASSED");

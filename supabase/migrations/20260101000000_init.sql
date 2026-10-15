-- ============================================================================
-- Revu — 0001 init
--
-- Applied ONLY with `supabase db push`. Never edit in the dashboard.
--
-- Tenancy model
--   agency  = Clerk Organization (staff are org members: org:admin / org:member)
--   client  = plain Clerk user. NEVER a member of the org. Linked to a clients
--             row by clients.clerk_user_id.
--
-- Authz is enforced in app code (src/lib/authz.ts) using the service role key.
-- RLS below is defence-in-depth for the anon/authenticated roles and relies on
-- Supabase's third-party auth integration with Clerk, where the request JWT is
-- Clerk's session token:
--   sub     -> Clerk user id      (e.g. "user_2abc...")
--   org_id  -> Clerk org id       (e.g. "org_2xyz..."), present when the user
--                                   has an active organization
--
-- These are the "version 1" session-token claims. Clerk now also emits a
-- compact "version 2" object (`o.id`, `o.rol`, ...). The helpers below read
-- both shapes so RLS works whichever version the instance issues; see the
-- note in AGENTS.md.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- JWT claim helpers
-- ---------------------------------------------------------------------------

-- Safely read the request JWT claims. Returns an empty object rather than
-- raising when there is no JWT (anon requests) or the setting is malformed.
create or replace function public.revu_jwt_claims()
returns jsonb
language plpgsql
stable
as $$
declare
  raw text;
begin
  raw := nullif(current_setting('request.jwt.claims', true), '');
  if raw is null then
    return '{}'::jsonb;
  end if;
  return raw::jsonb;
exception
  when others then
    return '{}'::jsonb;
end;
$$;

create or replace function public.current_clerk_user_id()
returns text
language sql
stable
as $$
  select nullif(public.revu_jwt_claims() ->> 'sub', '');
$$;

-- Active organization id, reading both claim shapes:
--   v1 -> top-level "org_id"      v2 -> o.id
create or replace function public.current_clerk_org_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(public.revu_jwt_claims() ->> 'org_id', ''),
    nullif(public.revu_jwt_claims() -> 'o' ->> 'id', '')
  );
$$;

-- Role of the current user inside their active Clerk organization, normalised
-- to the v1 form (org:admin / org:owner / org:member) so the policies below can
-- check a single spelling. v2 spells the role without the prefix (o.rol = 'admin').
-- Empty string when the session token carries no organization context.
create or replace function public.current_clerk_org_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(public.revu_jwt_claims() ->> 'org_role', ''),
    case nullif(public.revu_jwt_claims() -> 'o' ->> 'rol', '')
      when 'admin'  then 'org:admin'
      when 'owner'  then 'org:owner'
      when 'member' then 'org:member'
      else nullif(public.revu_jwt_claims() -> 'o' ->> 'rol', '')
    end,
    ''
  );
$$;


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.agencies (
  id           uuid primary key default gen_random_uuid(),
  clerk_org_id text        not null unique,
  name         text        not null,
  slug         text        not null unique,
  logo_url     text,
  brand_color  text        not null default '#4f46e5',
  plan         text        not null default 'free'
                           check (plan in ('free', 'starter', 'unlimited')),
  created_at   timestamptz not null default now(),
  constraint agencies_name_not_blank check (btrim(name) <> ''),
  constraint agencies_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid        not null references public.agencies (id) on delete cascade,
  -- Null until the invited client accepts and we link their Clerk user id.
  clerk_user_id text,
  name          text        not null,
  contact_name  text,
  email         text        not null,
  created_at    timestamptz not null default now(),
  constraint clients_email_not_blank check (btrim(email) <> ''),
  constraint clients_agency_email_key unique (agency_id, email),
  -- Redundant with the PK on its own, but it is the target of the composite FK
  -- on projects below, which stops a project from referencing a client that
  -- belongs to a different agency.
  constraint clients_agency_id_id_key unique (agency_id, id)
);

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid        not null references public.agencies (id) on delete cascade,
  client_id  uuid        not null,
  title      text        not null,
  status     text        not null default 'pending'
                         check (status in ('pending', 'active', 'in_review', 'complete', 'archived')),
  due_date   date,
  summary    text,
  created_at timestamptz not null default now(),
  constraint projects_title_not_blank check (btrim(title) <> ''),
  -- Cross-tenant guard: the client must live in the same agency as the project.
  constraint projects_client_same_agency_fkey
    foreign key (agency_id, client_id)
    references public.clients (agency_id, id) on delete cascade
);

create table public.deliverables (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid        not null references public.projects (id) on delete cascade,
  title      text        not null,
  brief      text,
  status     text        not null default 'pending'
                         check (status in ('pending', 'approved', 'changes_requested')),
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  constraint deliverables_title_not_blank check (btrim(title) <> '')
);

create table public.assets (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid        not null references public.deliverables (id) on delete cascade,
  storage_path   text        not null,
  name           text        not null,
  mime_type      text,
  size_bytes     bigint,
  created_at     timestamptz not null default now()
);

create table public.comments (
  id                   uuid primary key default gen_random_uuid(),
  deliverable_id       uuid        not null references public.deliverables (id) on delete cascade,
  body                 text        not null,
  author_clerk_user_id text        not null,
  author_role          text        not null check (author_role in ('agency', 'client')),
  created_at           timestamptz not null default now(),
  constraint comments_body_not_blank check (btrim(body) <> '')
);

create table public.activity (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid        not null references public.agencies (id) on delete cascade,
  project_id          uuid        references public.projects (id) on delete cascade,
  actor_clerk_user_id text,
  message             text        not null,
  created_at          timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Indexes — every FK column, plus the lookup columns on the hot paths
-- ---------------------------------------------------------------------------

-- clients.agency_id is the leading column of clients_agency_email_key, so the
-- unique constraint already covers it.
create index clients_clerk_user_id_idx   on public.clients (clerk_user_id);

create index projects_agency_id_idx      on public.projects (agency_id);
create index projects_client_id_idx      on public.projects (client_id);

create index deliverables_project_id_idx on public.deliverables (project_id, sort_order);

create index assets_deliverable_id_idx   on public.assets (deliverable_id);

create index comments_deliverable_id_idx on public.comments (deliverable_id, created_at);

create index activity_agency_id_idx      on public.activity (agency_id, created_at desc);
create index activity_project_id_idx     on public.activity (project_id);


-- ---------------------------------------------------------------------------
-- RLS access helpers
--
-- SECURITY DEFINER so the helpers can read the tables they are defined on
-- without re-entering RLS (the owner bypasses RLS), which also keeps policies
-- cheap and non-recursive.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_staff_of(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.agencies a
    where a.id = p_agency_id
      and a.clerk_org_id = public.current_clerk_org_id()
  );
$$;

create or replace function public.is_org_admin_of(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.agencies a
    where a.id = p_agency_id
      and a.clerk_org_id = public.current_clerk_org_id()
  )
  and public.current_clerk_org_role() in ('org:admin', 'org:owner');
$$;

create or replace function public.is_client_row_owner(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.clerk_user_id is not null
      and c.clerk_user_id = public.current_clerk_user_id()
  );
$$;

create or replace function public.can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        public.is_org_staff_of(p.agency_id)
        or public.is_client_row_owner(p.client_id)
      )
  );
$$;

create or replace function public.can_read_deliverable(p_deliverable_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.deliverables d
    where d.id = p_deliverable_id
      and public.can_read_project(d.project_id)
  );
$$;

-- Write-side helpers: membership in the owning organization, no client access.
create or replace function public.is_org_staff_of_deliverable(p_deliverable_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.deliverables d
    join public.projects p on p.id = d.project_id
    where d.id = p_deliverable_id
      and public.is_org_staff_of(p.agency_id)
  );
$$;

create or replace function public.is_org_staff_of_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.is_org_staff_of(p.agency_id)
  );
$$;


-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.agencies     enable row level security;
alter table public.clients      enable row level security;
alter table public.projects     enable row level security;
alter table public.deliverables enable row level security;
alter table public.assets       enable row level security;
alter table public.comments     enable row level security;
alter table public.activity     enable row level security;

-- agencies --------------------------------------------------------------
create policy agencies_select on public.agencies
  for select to authenticated
  using (
    clerk_org_id = public.current_clerk_org_id()
    or exists (
      select 1 from public.clients c
      where c.agency_id = agencies.id
        and c.clerk_user_id = public.current_clerk_user_id()
    )
  );

-- The create-agency flow writes with the service role; this only keeps a
-- same-org session from being unable to bootstrap if the anon key is used.
create policy agencies_insert on public.agencies
  for insert to authenticated
  with check (clerk_org_id = public.current_clerk_org_id());

create policy agencies_update_admin on public.agencies
  for update to authenticated
  using (public.is_org_admin_of(id))
  with check (public.is_org_admin_of(id));

-- clients ---------------------------------------------------------------
create policy clients_select on public.clients
  for select to authenticated
  using (
    public.is_org_staff_of(agency_id)
    or clerk_user_id = public.current_clerk_user_id()
  );

create policy clients_insert_staff on public.clients
  for insert to authenticated
  with check (public.is_org_staff_of(agency_id));

create policy clients_update_staff on public.clients
  for update to authenticated
  using (public.is_org_staff_of(agency_id))
  with check (public.is_org_staff_of(agency_id));

create policy clients_delete_staff on public.clients
  for delete to authenticated
  using (public.is_org_staff_of(agency_id));

-- projects --------------------------------------------------------------
create policy projects_select on public.projects
  for select to authenticated
  using (
    public.is_org_staff_of(agency_id)
    or public.is_client_row_owner(client_id)
  );

create policy projects_insert_staff on public.projects
  for insert to authenticated
  with check (public.is_org_staff_of(agency_id));

create policy projects_update_staff on public.projects
  for update to authenticated
  using (public.is_org_staff_of(agency_id))
  with check (public.is_org_staff_of(agency_id));

create policy projects_delete_staff on public.projects
  for delete to authenticated
  using (public.is_org_staff_of(agency_id));

-- deliverables ----------------------------------------------------------
create policy deliverables_select on public.deliverables
  for select to authenticated
  using (public.can_read_project(project_id));

-- Staff own the structure and content of a deliverable.
create policy deliverables_insert_staff on public.deliverables
  for insert to authenticated
  with check (public.is_org_staff_of_project(project_id));

create policy deliverables_update_staff on public.deliverables
  for update to authenticated
  using (public.is_org_staff_of_project(project_id))
  with check (public.is_org_staff_of_project(project_id));

create policy deliverables_delete_staff on public.deliverables
  for delete to authenticated
  using (public.is_org_staff_of_project(project_id));

-- Clients may only approve / request changes, never retitle or re-parent a
-- deliverable. RLS cannot restrict columns, so the grants below do: the
-- authenticated role can UPDATE only the status column of this table.
revoke update on public.deliverables from authenticated;
grant  update (status) on public.deliverables to authenticated;

-- assets ----------------------------------------------------------------
create policy assets_select on public.assets
  for select to authenticated
  using (public.can_read_deliverable(deliverable_id));

create policy assets_insert_staff on public.assets
  for insert to authenticated
  with check (public.is_org_staff_of_deliverable(deliverable_id));

create policy assets_update_staff on public.assets
  for update to authenticated
  using (public.is_org_staff_of_deliverable(deliverable_id))
  with check (public.is_org_staff_of_deliverable(deliverable_id));

create policy assets_delete_staff on public.assets
  for delete to authenticated
  using (public.is_org_staff_of_deliverable(deliverable_id));

-- comments --------------------------------------------------------------
create policy comments_select on public.comments
  for select to authenticated
  using (public.can_read_deliverable(deliverable_id));

-- Both staff and clients may comment, as themselves, on anything they can read.
create policy comments_insert_self on public.comments
  for insert to authenticated
  with check (
    public.can_read_deliverable(deliverable_id)
    and author_clerk_user_id = public.current_clerk_user_id()
    and author_role in ('agency', 'client')
  );

create policy comments_delete_staff on public.comments
  for delete to authenticated
  using (public.is_org_staff_of_deliverable(deliverable_id));

-- activity --------------------------------------------------------------
create policy activity_select on public.activity
  for select to authenticated
  using (
    public.is_org_staff_of(agency_id)
    or (project_id is not null and public.can_read_project(project_id))
  );

create policy activity_insert_staff on public.activity
  for insert to authenticated
  with check (public.is_org_staff_of(agency_id));

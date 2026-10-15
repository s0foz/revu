-- ============================================================================
-- Revu — 0002 Phase 2: private asset storage
--
-- Deliverable files live in one PRIVATE bucket called `assets`. Nothing is
-- public: every read goes through the app, which authorises the actor first and
-- then hands back a short-lived signed URL (src/app/api/assets/[id]/download).
--
-- Object key layout — the app writes exactly this shape:
--   <agency_id>/<project_id>/<deliverable_id>/<random>-<filename>
-- so a policy can recover the owning agency and deliverable from the key alone.
--
-- The app uploads and deletes with the service role (src/lib/storage.ts), which
-- bypasses these policies. They are the defence-in-depth layer for the anon key,
-- exactly like the table policies in 0001.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Safe uuid cast
--
-- Object keys are attacker-influenced text, so a bad first path segment must
-- return NULL instead of raising inside policy evaluation.
-- ---------------------------------------------------------------------------
create or replace function public.revu_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception
  when others then return null;
end;
$$;


-- ---------------------------------------------------------------------------
-- The bucket
--
-- 50 MiB per object. All MIME types are allowed; the app stores the uploader's
-- content type and always serves downloads as an attachment.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', false, 52428800)
on conflict (id) do update
  set public          = false,
      file_size_limit = excluded.file_size_limit;

-- Belt and braces: if the bucket already existed and was public, make it private.
update storage.buckets set public = false where id = 'assets';


-- ---------------------------------------------------------------------------
-- RLS policies on storage.objects
-- ---------------------------------------------------------------------------

-- Agency staff may read anything under their own agency's prefix.
drop policy if exists assets_objects_select_staff on storage.objects;
create policy assets_objects_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assets'
    and public.is_org_staff_of(public.revu_try_uuid((storage.foldername(name))[1]))
  );

-- A client may read a file only when the deliverable in the key is one they can
-- already read through public.can_read_deliverable().
drop policy if exists assets_objects_select_client on storage.objects;
create policy assets_objects_select_client on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assets'
    and public.can_read_deliverable(public.revu_try_uuid((storage.foldername(name))[3]))
  );

-- Uploads and deletes are staff-only; clients never write to the bucket.
drop policy if exists assets_objects_insert_staff on storage.objects;
create policy assets_objects_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets'
    and public.is_org_staff_of(public.revu_try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists assets_objects_update_staff on storage.objects;
create policy assets_objects_update_staff on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assets'
    and public.is_org_staff_of(public.revu_try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'assets'
    and public.is_org_staff_of(public.revu_try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists assets_objects_delete_staff on storage.objects;
create policy assets_objects_delete_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assets'
    and public.is_org_staff_of(public.revu_try_uuid((storage.foldername(name))[1]))
  );


-- ---------------------------------------------------------------------------
-- One asset row per uploaded object
--
-- `assets` in 0001 already carried storage_path; make the key unique so a retry
-- can never register the same object twice.
-- ---------------------------------------------------------------------------
create unique index if not exists assets_storage_path_key
  on public.assets (storage_path);

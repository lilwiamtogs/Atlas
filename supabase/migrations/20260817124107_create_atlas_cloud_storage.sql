create table if not exists public.atlas_documents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null check (schema_version > 0),
  revision bigint not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by text not null check (length(updated_by) between 1 and 200)
);

alter table public.atlas_documents enable row level security;

revoke all on table public.atlas_documents from anon;
grant select, insert, update, delete on table public.atlas_documents to authenticated;

drop policy if exists "Users can read their Atlas document" on public.atlas_documents;
create policy "Users can read their Atlas document" on public.atlas_documents
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their Atlas document" on public.atlas_documents;
create policy "Users can insert their Atlas document" on public.atlas_documents
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their Atlas document" on public.atlas_documents;
create policy "Users can update their Atlas document" on public.atlas_documents
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their Atlas document" on public.atlas_documents;
create policy "Users can delete their Atlas document" on public.atlas_documents
for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atlas-note-files', 'atlas-note-files', false, 52428800, array['application/pdf']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their Atlas PDFs" on storage.objects;
create policy "Users can read their Atlas PDFs" on storage.objects
for select to authenticated using (
  bucket_id = 'atlas-note-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload their Atlas PDFs" on storage.objects;
create policy "Users can upload their Atlas PDFs" on storage.objects
for insert to authenticated with check (
  bucket_id = 'atlas-note-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update their Atlas PDFs" on storage.objects;
create policy "Users can update their Atlas PDFs" on storage.objects
for update to authenticated
using (
  bucket_id = 'atlas-note-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'atlas-note-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their Atlas PDFs" on storage.objects;
create policy "Users can delete their Atlas PDFs" on storage.objects
for delete to authenticated using (
  bucket_id = 'atlas-note-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

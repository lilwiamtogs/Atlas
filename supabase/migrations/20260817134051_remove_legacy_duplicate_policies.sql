drop policy if exists "Users can read their own Atlas data" on public.atlas_documents;
drop policy if exists "Users can create their own Atlas data" on public.atlas_documents;
drop policy if exists "Users can update their own Atlas data" on public.atlas_documents;
drop policy if exists "Users can delete their own Atlas data" on public.atlas_documents;

drop policy if exists "Users can read their own Atlas note files" on storage.objects;
drop policy if exists "Users can upload their own Atlas note files" on storage.objects;
drop policy if exists "Users can update their own Atlas note files" on storage.objects;
drop policy if exists "Users can delete their own Atlas note files" on storage.objects;

-- Run this in Supabase SQL Editor if you already ran supabase-schema.sql
-- before photo uploads were added. This only adds what's new — safe to run
-- once on an existing project.

alter table posts add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('dinner-photos', 'dinner-photos', true)
on conflict (id) do nothing;

create policy "dinner-photos: read all"
on storage.objects for select
using (bucket_id = 'dinner-photos');

create policy "dinner-photos: insert own folder"
on storage.objects for insert
with check (
  bucket_id = 'dinner-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "dinner-photos: delete own"
on storage.objects for delete
using (
  bucket_id = 'dinner-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

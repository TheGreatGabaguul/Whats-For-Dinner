-- Run this in Supabase SQL Editor.

-- 1. Adds an admin flag to profiles.
alter table profiles add column if not exists is_admin boolean not null default false;

-- 2. Lets a post's own author OR an admin delete it. Ratings and reactions
--    on that post are removed automatically (they already cascade on
--    delete from the original schema).
drop policy if exists "posts: delete own or admin" on posts;
create policy "posts: delete own or admin" on posts for delete
using (
  auth.uid() = author_id
  or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- 3. Same rule for the uploaded photo in storage — normally you can only
--    delete files in your own folder, this adds an admin override.
drop policy if exists "dinner-photos: delete own" on storage.objects;
drop policy if exists "dinner-photos: delete own or admin" on storage.objects;
create policy "dinner-photos: delete own or admin"
on storage.objects for delete
using (
  bucket_id = 'dinner-photos'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
  )
);

-- 4. Make YOUR profile the admin account. Replace 'your_username' below
--    with whatever you typed as your username when you signed up
--    (case-sensitive, exactly as you typed it), then run this line.
-- update profiles set is_admin = true where name = 'your_username';

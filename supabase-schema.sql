-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar text not null,
  bio text default '',
  created_at timestamptz default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  meal text not null,
  description text default '',
  mood text default '',
  chef_id uuid references profiles(id),
  image_url text,
  frame text default 'none',
  created_at timestamptz default now()
);

create table ratings (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  primary key (post_id, user_id)
);

create table reactions (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  reaction text not null,
  primary key (post_id, user_id)
);

create table friends (
  user_id uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id) on delete cascade,
  primary key (user_id, friend_id)
);

-- Row Level Security: everyone can read everything (it's a small friend app),
-- but you can only write/change rows tied to your own anonymous session.

alter table profiles enable row level security;
alter table posts enable row level security;
alter table ratings enable row level security;
alter table reactions enable row level security;
alter table friends enable row level security;

create policy "profiles: read all" on profiles for select using (true);
create policy "profiles: insert own" on profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);

create policy "posts: read all" on posts for select using (true);
create policy "posts: insert own" on posts for insert with check (auth.uid() = author_id);

create policy "ratings: read all" on ratings for select using (true);
create policy "ratings: insert own" on ratings for insert with check (auth.uid() = user_id);
create policy "ratings: update own" on ratings for update using (auth.uid() = user_id);

create policy "reactions: read all" on reactions for select using (true);
create policy "reactions: insert own" on reactions for insert with check (auth.uid() = user_id);
create policy "reactions: update own" on reactions for update using (auth.uid() = user_id);
create policy "reactions: delete own" on reactions for delete using (auth.uid() = user_id);

create policy "friends: read all" on friends for select using (true);
create policy "friends: insert own" on friends for insert with check (auth.uid() = user_id);
create policy "friends: delete own" on friends for delete using (auth.uid() = user_id);

-- Storage bucket for dinner photos: public to read, but you can only upload
-- into a folder named after your own user id (enforced below).

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

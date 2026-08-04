-- Run this in Supabase SQL Editor if you already ran supabase-schema.sql
-- (and supabase-migration-add-photos.sql) before Y2K photo frames were
-- added. Safe to run once on an existing project.

alter table posts add column if not exists frame text default 'none';

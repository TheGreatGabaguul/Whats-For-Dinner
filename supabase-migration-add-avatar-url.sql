-- Run this in Supabase SQL Editor.

alter table profiles add column if not exists avatar_url text;

-- Set YOUR profile's custom avatar (the pizza-with-a-joint illustration
-- lives at /avatar-admin.png, included in this update's public/ folder).
-- Replace 'your_username' with your actual username exactly as typed at
-- signup, then run this line separately.
-- update profiles set avatar_url = '/avatar-admin.png' where name = 'your_username';

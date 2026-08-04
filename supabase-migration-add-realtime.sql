-- Run this in Supabase SQL Editor to enable live updates.
-- This adds each table to Supabase's realtime publication, which is what
-- lets the app push new posts/ratings/reactions to everyone instantly
-- instead of waiting for a manual refresh.
--
-- If any line errors with "already a member of publication", that table is
-- already enabled — safe to ignore and continue with the rest.

alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table ratings;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table friends;
alter publication supabase_realtime add table profiles;

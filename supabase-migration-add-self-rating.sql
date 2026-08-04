-- Run this in Supabase SQL Editor. Adds the poster's own half-star rating
-- of their meal (0.5–5.0). The old "description" and "mood" columns are
-- left in place and simply unused now — harmless to leave, or drop them
-- yourself later if you want a fully clean schema.

alter table posts add column if not exists self_rating numeric(2,1);

alter table posts
  add constraint self_rating_range
  check (self_rating is null or (self_rating >= 0.5 and self_rating <= 5));

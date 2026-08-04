# What's For Dinner

A Y2K-styled dinner-sharing app for you and your friends. Rate meals, react with
🗑️ 🍴 💋 👨‍🍳, tag the chef, and chase the "Meal of the Week" ribbon.

This is a real, deployable web app (Vite + React + Supabase) — not a Claude
artifact. Follow the steps below in order. None of it requires coding
experience; it's mostly copy/paste and clicking buttons. Budget ~30 minutes
the first time.

---

## 1. Create a Supabase project (your database)

1. Go to [supabase.com](https://supabase.com) → sign up (free) → **New project**.
2. Pick any name/region, set a database password (save it somewhere), and wait
   ~2 minutes for it to spin up.
3. In the left sidebar, go to **Authentication → Providers → Anonymous** and
   toggle it **on**, then save. This is what lets people use the app without
   typing a password — each browser just gets a saved session.
4. Go to **SQL Editor → New query**, paste in the entire contents of
   `supabase-schema.sql` (included in this project), and click **Run**. This
   creates the tables (profiles, posts, ratings, reactions, friends) and the
   security rules that let everyone read but only edit their own stuff.
5. Go to **Project Settings → API**. You'll need two values from this page in
   step 3 below:
   - **Project URL**
   - **anon public** key (NOT the `service_role` key — never share that one)

## 2. Get the code running on your computer

You'll need [Node.js](https://nodejs.org) installed (the LTS version).

```bash
cd whats-for-dinner
npm install
cp .env.example .env.local
```

Open `.env.local` and paste in your Project URL and anon key from step 1.5:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Then run it locally to make sure it works:

```bash
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`) — you should see the
onboarding screen. Create a profile and post a test dinner to confirm it's
talking to Supabase.

## 3. Push the code to GitHub

1. Create a free account at [github.com](https://github.com) if you don't
   have one.
2. Create a **New repository** (e.g. `whats-for-dinner`) — keep it empty, no
   README/gitignore (this project already has them).
3. From inside the `whats-for-dinner` folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/whats-for-dinner.git
git push -u origin main
```

(`.env.local` is in `.gitignore` so your Supabase key won't be uploaded —
you'll add it separately in Vercel next.)

## 4. Deploy with Vercel (get a live URL)

1. Go to [vercel.com](https://vercel.com) → sign up with your GitHub account.
2. **Add New → Project** → import the `whats-for-dinner` repo.
3. Vercel auto-detects Vite — leave the build settings as-is.
4. Before deploying, expand **Environment Variables** and add the same two
   values from your `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. In about a minute you'll get a live URL like
   `whats-for-dinner.vercel.app` — this already works for sharing with
   friends.

## 5. Add your own domain

1. Buy a domain if you don't have one — Namecheap, Cloudflare Registrar, or
   Porkbun are all fine (~$10–15/year for a `.com`).
2. In Vercel: your project → **Settings → Domains** → enter your domain →
   **Add**.
3. Vercel will show you one or two DNS records to add (usually an `A` record
   or a `CNAME`). Go to your domain registrar's DNS settings and add exactly
   what Vercel shows you.
4. DNS changes can take a few minutes to a few hours to propagate. Vercel's
   domain page will show a green checkmark once it's live, and it issues
   HTTPS automatically.

---

## Adding photo uploads to an existing project

If you already set up Supabase before photos were added:

1. Supabase → **SQL Editor → New query** → paste in
   `supabase-migration-add-photos.sql` → **Run**. This adds the `image_url`
   column and creates a public `dinner-photos` storage bucket with rules so
   people can only upload into their own folder.
2. Pull the latest code (or re-copy `src/App.jsx`), commit, and push — Vercel
   will redeploy automatically.

Photos are automatically resized to a max of 1600px on the longest side and
re-encoded as JPEG at 82% quality before upload — every photo lands around
the same size regardless of what the phone camera originally produced.
Adjust `MAX_DIMENSION` / `JPEG_QUALITY` in `src/App.jsx` if you want them
sharper or smaller. The original file is still capped at `MAX_IMAGE_MB`
(8MB) before compression even starts, just to stop someone uploading
something absurd.

## Adding photo frames to an existing project

If you already set up Supabase before the Y2K frame picker was added:

1. Supabase → **SQL Editor → New query** → paste in
   `supabase-migration-add-frames.sql` → **Run**. This just adds a `frame`
   column (defaults to `'none'` for existing posts).
2. Pull the latest `src/App.jsx`, commit, push.

## Making it installable, with live updates

Two upgrades, done in this update:

**1. Installable like a real app.** The project now includes a web app
manifest and service worker (via `vite-plugin-pwa`), plus the icons in
`public/`. Once deployed to Vercel (regular HTTPS is required — this doesn't
work on `localhost` for iOS, and Android wants HTTPS too):

- **Android / Chrome / Edge:** visit the site, tap the **Install app** icon in
  the address bar (or the "Add to Home Screen" banner that shows up
  automatically).
- **iPhone / Safari:** tap the **Share** button → **Add to Home Screen**.
- **Desktop Chrome/Edge:** an install icon (⊕ or a little monitor) appears in
  the address bar.

Once installed, it opens in its own window with no browser chrome, its own
icon, and its own app switcher entry — genuinely feels like a native app.

New deploys auto-update: the service worker checks for a new version in the
background and swaps it in on the next load, no app-store-style update
prompt needed.

**2. Live data updates.** The app now subscribes to Supabase Realtime. When
anyone posts a dinner, rates something, reacts, or adds a friend, everyone
else's open tab/app picks it up within a second — no manual refresh. Run
`supabase-migration-add-realtime.sql` in the SQL Editor to turn this on
(safe to run even on a project with existing data).

To update an existing deployment: run the realtime migration, replace
`vite.config.js`, `index.html`, and `src/App.jsx`, add the five new files in
`public/`, run `npm install` (to pull in `vite-plugin-pwa`), then commit and
push as usual.

## Adding the self-rating / gold aura to an existing project

1. Supabase → **SQL Editor → New query** → paste in
   `supabase-migration-add-self-rating.sql` → **Run**. Adds a `self_rating`
   column (0.5–5.0) to `posts`.
2. Pull the latest `src/App.jsx`, commit, push.

The composer's old "tell us about it" text field and mood emoji picker are
gone, replaced by a half-star picker — tap the left half of a star for a
`.5`, the right half for a whole number. Posting a perfect 5 wraps that
post in a pulsing gold aura border in the feed, plus a "★ PERFECT ★" badge.
Community ratings (other people star-rating the post after it's up) are
unchanged and still separate from this self-rating.

## Adding delete + admin account to an existing project

1. Supabase → **SQL Editor → New query** → paste in
   `supabase-migration-add-delete-and-admin.sql` → **Run**.
2. The last line in that file is commented out on purpose — it sets your
   own profile as admin. Edit it with your actual username and run just
   that one line separately:
   ```sql
   update profiles set is_admin = true where name = 'your_username';
   ```
3. Pull the latest `src/App.jsx`, commit, push.

Now every post has a hidden **⋮** menu (top-right of the card) with a
**delete post** option — visible only if you posted it, or if your account
is admin. Deleting a post removes its ratings, reactions, and uploaded
photo along with it, and asks for a confirmation first since it can't be
undone.

## Adding your custom avatar + admin badge to an existing project

1. Supabase → **SQL Editor → New query** → paste in
   `supabase-migration-add-avatar-url.sql` → **Run**.
2. Edit and run this line separately with your actual username:
   ```sql
   update profiles set avatar_url = '/avatar-admin.png' where name = 'your_username';
   ```
3. Pull the latest `src/App.jsx` and the new `public/avatar-admin.png`,
   commit, push.

Anywhere your name shows up — the feed, your sidebar card, your profile
page, the friends list, Meal of the Week, the Five-Star Wall — it now shows
your custom illustrated avatar instead of an emoji, plus a small "ADMIN"
tag next to your name (since you're already admin from the delete-post
update). This is set manually per-profile via SQL; there's no upload UI for
custom avatars, just this one for your own account.

## Notes and honest limitations

- **"We reach out" for 5-star meals** is represented in-app (the Meal of the
  Week ribbon + the Five-Star Wall), not as an actual email/notification.
- **Visibility:** every profile and post is readable by anyone using the app
  (that's what the `select using (true)` policies mean). There's no private
  friends-only feed — it's a small shared table for your group.
- **Free tier limits:** Supabase's free tier and Vercel's free tier are both
  generous for a friends-and-family app (tens of thousands of requests/month).
  You won't hit limits unless this goes viral.

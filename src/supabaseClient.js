import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// People log in with a plain username, not an email — but Supabase's
// built-in auth wants an email address, so we deterministically turn each
// username into a fake one behind the scenes (e.g. "pastaqueen" becomes
// "pastaqueen@wfd.local"). Nobody ever sees this; it just lets us reuse
// Supabase's real, tested password auth instead of building our own.
function usernameToEmail(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `${clean}@wfd.local`;
}

export function isValidUsername(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return clean.length >= 3;
}

export async function signUpWithUsername(username, password) {
  const email = usernameToEmail(username);
  return supabase.auth.signUp({ email, password });
}

export async function signInWithUsername(username, password) {
  const email = usernameToEmail(username);
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

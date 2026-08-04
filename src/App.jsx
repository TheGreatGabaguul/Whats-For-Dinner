import React, { useState, useEffect, useCallback, useRef } from "react";
import { Star, ChefHat, Users, Home, User, Trophy, Sparkles, Plus, X, Camera, Loader2, Crown, LogOut } from "lucide-react";
import { supabase, getSession, signUpWithUsername, signInWithUsername, signOut, isValidUsername } from "./supabaseClient";

const MAX_IMAGE_MB = 8; // hard cap on the ORIGINAL file before compression
const MAX_DIMENSION = 1600; // longest side, in pixels, after compression
const JPEG_QUALITY = 0.82;

// Resizes + re-encodes any picked photo down to a consistent max dimension
// and JPEG quality, so every upload lands around the same file size
// regardless of what the phone/camera originally produced.
function compressImage(file, maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Couldn't compress that image."));
            return;
          }
          const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          resolve(new File([blob], newName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image."));
    };
    img.src = objectUrl;
  });
}

// ---------- Y2K design tokens ----------
const COLORS = {
  bg: "#FFF4D6",
  panel: "#FFFDF6",
  pink: "#FF5DA2",
  pinkDark: "#D63A81",
  lime: "#B4E600",
  purple: "#5B2C82",
  purpleDeep: "#3A1B54",
  orange: "#FF8A3D",
  gold: "#FFC93C",
  ink: "#3A1B54",
};

const AVATARS = ["🍕","🍜","🍔","🥑","🍳","🌮","🍩","🥗","🍣","🍝","🍦","🧀","🥘","🍱","🍲","🥞"];

const FRAMES = [
  { key: "none", label: "no frame", swatch: "⬜" },
  { key: "flame", label: "flame", swatch: "🔥" },
  { key: "holo", label: "holographic", swatch: "🌈" },
  { key: "tribal", label: "barbed wire", swatch: "⚡" },
  { key: "dots", label: "rainbow dots", swatch: "🔴" },
  { key: "chrome", label: "chrome", swatch: "⚙️" },
];

const REACTIONS = [
  { key: "trash", emoji: "🗑️", label: "Trash it" },
  { key: "fork", emoji: "🍴", label: "Fork & knife" },
  { key: "kiss", emoji: "💋", label: "Chef's kiss" },
  { key: "chef", emoji: "👨‍🍳", label: "Mama mia!" },
];

// Tallies interactions between "me" and each friend across the whole
// timeline — reactions and ratings given in either direction, plus chef
// tags — and returns whoever scores highest.
function computeBestFriend(myId, friendIds, timeline) {
  if (!friendIds.length) return null;
  const scores = Object.fromEntries(friendIds.map((id) => [id, 0]));

  for (const post of timeline) {
    const isMine = post.author_id === myId;
    const isTheirs = friendIds.includes(post.author_id);

    if (isMine || isTheirs) {
      const targetId = isMine ? null : post.author_id;
      // Reactions
      Object.entries(post.reactionsMap || {}).forEach(([userId]) => {
        if (isMine && friendIds.includes(userId)) scores[userId] += 1;
        if (isTheirs && userId === myId) scores[post.author_id] += 1;
      });
      // Ratings
      Object.entries(post.ratingsMap || {}).forEach(([userId]) => {
        if (isMine && friendIds.includes(userId)) scores[userId] += 1;
        if (isTheirs && userId === myId) scores[post.author_id] += 1;
      });
    }

    // Chef tags count extra — cooking for someone (or being cooked for) is a strong signal
    if (isMine && post.chef_id && friendIds.includes(post.chef_id)) scores[post.chef_id] += 3;
    if (isTheirs && post.chef_id === myId) scores[post.author_id] += 3;
  }

  let best = null;
  for (const id of friendIds) {
    if (!best || scores[id] > scores[best]) best = id;
  }
  return scores[best] > 0 ? { id: best, score: scores[best] } : null;
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function Box({ children, style, tilt = 0 }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `3px solid ${COLORS.ink}`,
        borderRadius: 14,
        boxShadow: `5px 5px 0px ${COLORS.ink}`,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PixelBadge({ children, bg = COLORS.gold }) {
  return (
    <span
      style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 8,
        background: bg,
        color: COLORS.purpleDeep,
        padding: "4px 6px",
        border: `2px solid ${COLORS.ink}`,
        borderRadius: 4,
        display: "inline-block",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}

// Zigzag polygon for the "barbed wire" tribal frame — percentages so it
// scales to any element size.
const TRIBAL_CLIP_PATH =
  "polygon(0% 0%,10% 6%,20% 0%,30% 6%,40% 0%,50% 6%,60% 0%,70% 6%,80% 0%,90% 6%,100% 0%," +
  "94% 10%,100% 20%,94% 30%,100% 40%,94% 50%,100% 60%,94% 70%,100% 80%,94% 90%,100% 100%," +
  "90% 94%,80% 100%,70% 94%,60% 100%,50% 94%,40% 100%,30% 94%,20% 100%,10% 94%,0% 100%," +
  "6% 90%,0% 80%,6% 70%,0% 60%,6% 50%,0% 40%,6% 30%,0% 20%,6% 10%)";

function FrameStyles() {
  return (
    <style>{`
      .wfd-frame-plain { border: 3px solid ${COLORS.ink}; border-radius: 10px; }

      .wfd-frame-flame {
        border: 8px solid;
        border-image: repeating-linear-gradient(45deg, #FF3D00 0 10px, #FFC93C 10px 20px) 8;
        border-radius: 6px;
        animation: wfd-flicker 1.4s ease-in-out infinite;
      }
      @keyframes wfd-flicker {
        0%, 100% { box-shadow: 0 0 14px 2px rgba(255,90,0,0.7); }
        50% { box-shadow: 0 0 22px 6px rgba(255,140,0,0.9); }
      }

      .wfd-frame-holo {
        border: 10px solid transparent;
        background-image: linear-gradient(#fff,#fff), linear-gradient(120deg,#ff5da2,#ffd93c,#7fffbf,#5da2ff,#c93cff,#ff5da2);
        background-origin: border-box;
        background-clip: padding-box, border-box;
        background-size: 100% 100%, 300% 300%;
        animation: wfd-holo-shift 3s ease infinite;
        border-radius: 6px;
      }
      @keyframes wfd-holo-shift {
        0% { background-position: 0 0, 0% 50%; }
        50% { background-position: 0 0, 100% 50%; }
        100% { background-position: 0 0, 0% 50%; }
      }

      .wfd-frame-tribal-bg {
        position: absolute;
        inset: 0;
        background: #1a1a1a;
        clip-path: ${TRIBAL_CLIP_PATH};
      }

      .wfd-frame-dots {
        border: 8px dashed;
        border-image: repeating-linear-gradient(90deg, #ff3d3d, #ff9f3d, #ffe93d, #6dff3d, #3dc8ff, #b23dff, #ff3d3d) 1;
        border-radius: 4px;
      }
      .wfd-dot {
        position: absolute;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid ${COLORS.ink};
        z-index: 2;
      }

      .wfd-frame-chrome {
        border: 8px solid;
        border-image: linear-gradient(135deg, #f5f5f5, #999 30%, #eee 50%, #666 70%, #ccc) 8;
        box-shadow: inset 0 2px 3px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4);
        border-radius: 4px;
      }

      @media (prefers-reduced-motion: reduce) {
        .wfd-frame-flame, .wfd-frame-holo { animation: none !important; }
      }
    `}</style>
  );
}

// Renders a food photo (or, on the landing screen, the logo) inside
// whichever Y2K frame is active.
function PhotoFrame({ frame = "none", src, alt, width = "100%", height = 260, fit = "cover", bg, containerStyle }) {
  if (!src) return null;
  const box = { width, height, marginTop: 10, ...containerStyle };
  const imgBase = { width: "100%", height: "100%", objectFit: fit, display: "block", background: bg };

  if (frame === "tribal") {
    return (
      <div style={{ ...box, position: "relative", padding: 14, boxSizing: "border-box" }}>
        <div className="wfd-frame-tribal-bg" />
        <img src={src} alt={alt} style={{ ...imgBase, position: "relative", zIndex: 1, borderRadius: 4 }} />
      </div>
    );
  }

  if (frame === "dots") {
    return (
      <div style={{ ...box, position: "relative" }}>
        <img src={src} alt={alt} className="wfd-frame-dots" style={imgBase} />
        <span className="wfd-dot" style={{ top: -6, left: -6, background: "#FF3D3D" }} />
        <span className="wfd-dot" style={{ top: -6, right: -6, background: "#3DC8FF" }} />
        <span className="wfd-dot" style={{ bottom: -6, left: -6, background: "#FFE93D" }} />
        <span className="wfd-dot" style={{ bottom: -6, right: -6, background: "#6DFF3D" }} />
      </div>
    );
  }

  const cls = frame && frame !== "none" ? `wfd-frame-${frame}` : "wfd-frame-plain";
  return (
    <div style={box}>
      <img src={src} alt={alt} className={cls} style={imgBase} />
    </div>
  );
}

// The 5 Y2K frames, cycling automatically around the logo on the landing screen.
const LANDING_FRAMES = ["flame", "holo", "tribal", "dots", "chrome"];

function LandingStyles() {
  return (
    <style>{`
      .wfd-landing-bg {
        background: linear-gradient(135deg, ${COLORS.purpleDeep}, ${COLORS.pink} 45%, ${COLORS.orange} 100%);
        background-size: 220% 220%;
        animation: wfd-landing-gradient 9s ease infinite;
      }
      @keyframes wfd-landing-gradient {
        0% { background-position: 0% 30%; }
        50% { background-position: 100% 70%; }
        100% { background-position: 0% 30%; }
      }

      .wfd-landing-sparkle {
        animation: wfd-landing-float 3.4s ease-in-out infinite;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
      }
      @keyframes wfd-landing-float {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-14px) rotate(12deg); }
      }

      .wfd-landing-frame-outer { animation: wfd-landing-fade 0.55s ease; }
      @keyframes wfd-landing-fade {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }

      .wfd-landing-frame-box { width: 100%; aspect-ratio: 1 / 1; box-sizing: border-box; }

      .wfd-landing-plain { border: 6px solid ${COLORS.ink}; border-radius: 20px; }

      .wfd-landing-flame {
        border: 16px solid;
        border-image: repeating-linear-gradient(45deg, #FF3D00 0 18px, #FFC93C 18px 36px) 16;
        border-radius: 16px;
        animation: wfd-flicker-big 1.3s ease-in-out infinite;
      }
      @keyframes wfd-flicker-big {
        0%, 100% { box-shadow: 0 0 30px 6px rgba(255,90,0,0.75); }
        50% { box-shadow: 0 0 55px 14px rgba(255,140,0,0.95); }
      }

      .wfd-landing-holo {
        border: 18px solid transparent;
        background-image: linear-gradient(#fff,#fff), linear-gradient(120deg,#ff5da2,#ffd93c,#7fffbf,#5da2ff,#c93cff,#ff5da2);
        background-origin: border-box;
        background-clip: padding-box, border-box;
        background-size: 100% 100%, 320% 320%;
        animation: wfd-holo-shift-big 2.6s ease infinite;
        border-radius: 16px;
      }
      @keyframes wfd-holo-shift-big {
        0% { background-position: 0 0, 0% 50%; }
        50% { background-position: 0 0, 100% 50%; }
        100% { background-position: 0 0, 0% 50%; }
      }

      .wfd-landing-tribal-wrap { position: relative; padding: 22px; box-sizing: border-box; }
      .wfd-landing-tribal-bg {
        position: absolute;
        inset: 0;
        background: #1a1a1a;
        clip-path: ${TRIBAL_CLIP_PATH};
      }

      .wfd-landing-dots {
        border: 16px dashed;
        border-image: repeating-linear-gradient(90deg, #ff3d3d,#ff9f3d,#ffe93d,#6dff3d,#3dc8ff,#b23dff,#ff3d3d) 1;
        border-radius: 12px;
      }
      .wfd-landing-dot {
        position: absolute;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid ${COLORS.ink};
        z-index: 2;
      }

      .wfd-landing-chrome {
        border: 16px solid;
        border-image: linear-gradient(135deg,#f5f5f5,#999 30%,#eee 50%,#666 70%,#ccc) 16;
        box-shadow: inset 0 3px 5px rgba(255,255,255,0.9), inset 0 -5px 10px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4);
        border-radius: 12px;
      }

      @media (prefers-reduced-motion: reduce) {
        .wfd-landing-bg, .wfd-landing-sparkle, .wfd-landing-flame, .wfd-landing-holo, .wfd-landing-frame-outer {
          animation: none !important;
        }
      }
    `}</style>
  );
}

function LandingLogo({ frame }) {
  const img = { width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#fff" };

  if (frame === "tribal") {
    return (
      <div className="wfd-landing-frame-box wfd-landing-tribal-wrap">
        <div className="wfd-landing-tribal-bg" />
        <img src="/logo.png" alt="What's For Dinner" style={{ ...img, position: "relative", zIndex: 1 }} />
      </div>
    );
  }

  if (frame === "dots") {
    return (
      <div className="wfd-landing-frame-box" style={{ position: "relative" }}>
        <img src="/logo.png" alt="What's For Dinner" className="wfd-landing-dots" style={img} />
        <span className="wfd-landing-dot" style={{ top: -14, left: -14, background: "#FF3D3D" }} />
        <span className="wfd-landing-dot" style={{ top: -14, right: -14, background: "#3DC8FF" }} />
        <span className="wfd-landing-dot" style={{ bottom: -14, left: -14, background: "#FFE93D" }} />
        <span className="wfd-landing-dot" style={{ bottom: -14, right: -14, background: "#6DFF3D" }} />
      </div>
    );
  }

  const cls = frame && frame !== "none" ? `wfd-landing-${frame}` : "wfd-landing-plain";
  return (
    <div className="wfd-landing-frame-box">
      <img src="/logo.png" alt="What's For Dinner" className={cls} style={img} />
    </div>
  );
}

function LandingScreen({ onChoose }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFrameIndex((i) => (i + 1) % LANDING_FRAMES.length), 2400);
    return () => clearInterval(t);
  }, []);

  const frame = LANDING_FRAMES[frameIndex];

  return (
    <div
      className="wfd-landing-bg"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <LandingStyles />

      <div className="wfd-landing-sparkle" style={{ position: "absolute", top: "8%", left: "8%", fontSize: 26 }}>✨</div>
      <div className="wfd-landing-sparkle" style={{ position: "absolute", top: "14%", right: "10%", fontSize: 20, animationDelay: "0.6s" }}>⭐</div>
      <div className="wfd-landing-sparkle" style={{ position: "absolute", bottom: "18%", left: "10%", fontSize: 22, animationDelay: "1.1s" }}>🌟</div>
      <div className="wfd-landing-sparkle" style={{ position: "absolute", bottom: "12%", right: "8%", fontSize: 24, animationDelay: "0.3s" }}>✨</div>

      <div style={{ width: "min(88vw, 500px)", position: "relative", zIndex: 2 }}>
        <div key={frame} className="wfd-landing-frame-outer">
          <LandingLogo frame={frame} />
        </div>
      </div>

      <p
        style={{
          color: "#fff",
          textShadow: `2px 2px 0 ${COLORS.ink}`,
          marginTop: 22,
          marginBottom: 26,
          fontFamily: "'Fredoka', sans-serif",
          fontSize: 16,
          textAlign: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        rate your grub · tag your chef · get famous
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "min(88vw, 340px)", position: "relative", zIndex: 2 }}>
        <button
          onClick={() => onChoose("signup")}
          style={{ ...primaryBtn(false), marginTop: 0, fontSize: 17, padding: "13px 14px", background: COLORS.lime, color: COLORS.purpleDeep }}
        >
          create new account
        </button>
        <button
          onClick={() => onChoose("login")}
          style={{ ...primaryBtn(false), marginTop: 0, fontSize: 17, padding: "13px 14px", background: "#fff", color: COLORS.purpleDeep }}
        >
          log in
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [directory, setDirectory] = useState({});
  const [friends, setFriends] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [tab, setTab] = useState("feed");
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [error, setError] = useState("");
  const [authStage, setAuthStage] = useState("landing"); // "landing" | "form"
  const [authMode, setAuthMode] = useState("signup"); // "signup" | "login"

  const loadAll = useCallback(async (myId) => {
    const [profilesRes, postsRes, friendsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase
        .from("posts")
        .select("*, ratings(user_id, stars), reactions(user_id, reaction)")
        .order("created_at", { ascending: false }),
      supabase.from("friends").select("friend_id").eq("user_id", myId),
    ]);

    const dir = {};
    (profilesRes.data || []).forEach((p) => (dir[p.id] = p));
    setDirectory(dir);

    const posts = (postsRes.data || []).map((p) => ({
      ...p,
      ratingsMap: Object.fromEntries((p.ratings || []).map((r) => [r.user_id, r.stars])),
      reactionsMap: Object.fromEntries((p.reactions || []).map((r) => [r.user_id, r.reaction])),
    }));
    setTimeline(posts);

    setFriends((friendsRes.data || []).map((f) => f.friend_id));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSession();
        setSession(s);
        if (s) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", s.user.id)
            .maybeSingle();
          setProfile(prof || null);
          await loadAll(s.user.id);
        }
      } catch (e) {
        setError("Couldn't connect. Check your Supabase URL/key in .env.local.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  // Live updates: whenever anyone posts, rates, reacts, or adds a friend,
  // every open tab quietly refetches so the feed stays current without a
  // manual reload. Debounced so a burst of changes (e.g. a photo upload
  // plus its post row) only triggers one refetch.
  useEffect(() => {
    if (!profile) return;
    let debounceTimer = null;
    const refetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadAll(profile.id), 400);
    };

    const channel = supabase
      .channel("wfd-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refetch)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, loadAll]);

  async function handleSignUp({ username, password, avatar, bio }) {
    setError("");
    const { data, error: err } = await signUpWithUsername(username, password);
    if (err) {
      if (err.message.includes("already registered")) {
        setError("That username's taken — try logging in instead, or pick another.");
      } else {
        setError(err.message);
      }
      return;
    }
    if (!data.session) {
      setError(
        "Account created, but no session came back — check that 'Confirm email' is turned off in Supabase (Authentication → Providers → Email)."
      );
      return;
    }
    setSession(data.session);
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .insert({ id: data.session.user.id, name: username.trim(), avatar, bio: bio.trim() })
      .select()
      .single();
    if (profErr) {
      setError("Account created, but couldn't save your profile: " + profErr.message);
      return;
    }
    setProfile(prof);
    setDirectory((d) => ({ ...d, [prof.id]: prof }));
    await loadAll(data.session.user.id);
  }

  async function handleLogIn({ username, password }) {
  setError("");
  const { data, error: err } = await signInWithUsername(username, password);
  if (err) {
    setError(`Login failed: ${err.message}`);
    return;
  }
    setSession(data.session);
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.session.user.id)
      .maybeSingle();
    setProfile(prof || null);
    await loadAll(data.session.user.id);
  }

  async function handleFinishProfile({ name, avatar, bio }) {
    setError("");
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .insert({ id: session.user.id, name: name.trim(), avatar, bio: bio.trim() })
      .select()
      .single();
    if (profErr) {
      setError("Couldn't save your profile: " + profErr.message);
      return;
    }
    setProfile(prof);
    setDirectory((d) => ({ ...d, [prof.id]: prof }));
    await loadAll(session.user.id);
  }

  async function handleLogOut() {
    await signOut();
    setSession(null);
    setProfile(null);
    setDirectory({});
    setFriends([]);
    setTimeline([]);
    setTab("feed");
  }

  async function addFriend(id) {
    if (friends.includes(id) || id === profile.id) return;
    setFriends((f) => [...f, id]);
    await supabase.from("friends").insert({ user_id: profile.id, friend_id: id });
  }
  async function removeFriend(id) {
    setFriends((f) => f.filter((x) => x !== id));
    await supabase.from("friends").delete().eq("user_id", profile.id).eq("friend_id", id);
  }

  async function postDinner({ meal, description, mood, chefId, imageFile, frame }) {
    let image_url = null;

    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("dinner-photos")
        .upload(path, imageFile, { cacheControl: "3600", upsert: false });
      if (uploadErr) {
        setError("Couldn't upload photo: " + uploadErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("dinner-photos").getPublicUrl(path);
      image_url = pub.publicUrl;
    }

    const { data, error: err } = await supabase
      .from("posts")
      .insert({
        author_id: profile.id,
        meal: meal.trim(),
        description: description.trim(),
        mood,
        chef_id: chefId || null,
        image_url,
        frame: image_url ? frame || "none" : "none",
      })
      .select()
      .single();
    if (err) {
      setError("Couldn't post: " + err.message);
      return;
    }
    setTimeline((t) => [{ ...data, ratingsMap: {}, reactionsMap: {} }, ...t]);
    setShowComposer(false);
  }

  async function rate(postId, stars) {
    setTimeline((t) =>
      t.map((p) =>
        p.id === postId ? { ...p, ratingsMap: { ...p.ratingsMap, [profile.id]: stars } } : p
      )
    );
    await supabase
      .from("ratings")
      .upsert({ post_id: postId, user_id: profile.id, stars }, { onConflict: "post_id,user_id" });
  }

  async function react(postId, reactionKey) {
    const post = timeline.find((p) => p.id === postId);
    const turningOff = post?.reactionsMap[profile.id] === reactionKey;

    setTimeline((t) =>
      t.map((p) => {
        if (p.id !== postId) return p;
        const next = { ...p.reactionsMap };
        if (turningOff) delete next[profile.id];
        else next[profile.id] = reactionKey;
        return { ...p, reactionsMap: next };
      })
    );

    if (turningOff) {
      await supabase.from("reactions").delete().eq("post_id", postId).eq("user_id", profile.id);
    } else {
      await supabase
        .from("reactions")
        .upsert(
          { post_id: postId, user_id: profile.id, reaction: reactionKey },
          { onConflict: "post_id,user_id" }
        );
    }
  }

  if (loading) {
    return (
      <div style={wrap()}>
        <div style={{ fontFamily: "'Fredoka', sans-serif", color: COLORS.purple, fontSize: 20, padding: 40 }}>
          loading the kitchen... 🍳
        </div>
      </div>
    );
  }

  if (!session) {
    if (authStage === "landing") {
      return (
        <LandingScreen
          onChoose={(mode) => {
            setAuthMode(mode);
            setAuthStage("form");
          }}
        />
      );
    }
    return (
      <div style={wrap()}>
        <AuthScreen
          initialMode={authMode}
          onBack={() => setAuthStage("landing")}
          onSignUp={handleSignUp}
          onLogIn={handleLogIn}
          error={error}
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={wrap()}>
        <ProfileSetup onSubmit={handleFinishProfile} error={error} />
      </div>
    );
  }

  const author = (id) => directory[id] || { name: "Unknown Cook", avatar: "❓" };
  const weekAgo = Date.now() - 7 * 86400000;
  const mealOfWeek = [...timeline]
    .filter((p) => new Date(p.created_at).getTime() >= weekAgo)
    .map((p) => ({ p, fives: Object.values(p.ratingsMap).filter((r) => r === 5).length }))
    .filter((x) => x.fives > 0)
    .sort((a, b) => b.fives - a.fives)[0];

  const fiveStarWall = timeline.filter((p) => Object.values(p.ratingsMap).some((r) => r === 5));

  return (
    <div style={wrap()}>
      <FrameStyles />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 12px 60px" }}>
        <Header onNew={() => setShowComposer(true)} onLogOut={handleLogOut} />
        <MarqueeTicker timeline={timeline} directory={directory} />

        <div style={{ display: "flex", gap: 16, marginTop: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 240, flexShrink: 0 }}>
            <ProfileCard profile={profile} postsCount={timeline.filter((p) => p.author_id === profile.id).length} />
            <div style={{ height: 14 }} />
            <BestFriendCard bestFriend={computeBestFriend(profile.id, friends, timeline)} directory={directory} onView={setViewingProfileId} />
            <div style={{ height: 14 }} />
            <NavBox tab={tab} setTab={setTab} />
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            {tab === "feed" && (
              <>
                {mealOfWeek && <MealOfWeek entry={mealOfWeek} author={author(mealOfWeek.p.author_id)} />}
                <Feed
                  posts={timeline}
                  author={author}
                  profile={profile}
                  onRate={rate}
                  onReact={react}
                  onViewProfile={setViewingProfileId}
                />
              </>
            )}
            {tab === "friends" && (
              <FriendsTab
                directory={directory}
                friends={friends}
                profile={profile}
                onAdd={addFriend}
                onRemove={removeFriend}
                onView={setViewingProfileId}
              />
            )}
            {tab === "hall" && <HallOfFame posts={fiveStarWall} author={author} />}
            {tab === "profile" && (
              <ProfilePage person={profile} posts={timeline.filter((p) => p.author_id === profile.id)} isMe />
            )}
          </div>
        </div>
      </div>

      {viewingProfileId && (
        <Modal onClose={() => setViewingProfileId(null)}>
          <ProfilePage
            person={author(viewingProfileId)}
            posts={timeline.filter((p) => p.author_id === viewingProfileId)}
            isMe={viewingProfileId === profile.id}
            isFriend={friends.includes(viewingProfileId)}
            onAddFriend={() => addFriend(viewingProfileId)}
          />
        </Modal>
      )}

      {showComposer && (
        <Modal onClose={() => setShowComposer(false)}>
          <Composer friends={friends} directory={directory} onSubmit={postDinner} />
        </Modal>
      )}

      {error && (
        <div style={{ position: "fixed", bottom: 12, left: 12, right: 12, textAlign: "center" }}>
          <span style={{ background: "#fff", border: `2px solid ${COLORS.ink}`, borderRadius: 10, padding: "6px 12px", fontSize: 12 }}>
            {error}
          </span>
        </div>
      )}
    </div>
  );
}

function wrap() {
  return {
    minHeight: "100vh",
    background: COLORS.bg,
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 2px, transparent 2px, transparent 22px)",
    fontFamily: "'Comic Neue', cursive",
    color: COLORS.ink,
  };
}

function AuthScreen({ onSignUp, onLogIn, error, initialMode = "signup", onBack }) {
  const [mode, setMode] = useState(initialMode); // "signup" | "login"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [bio, setBio] = useState("");
  const [localError, setLocalError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setLocalError("");
    if (!isValidUsername(username)) {
      setLocalError("Username needs at least 3 letters/numbers.");
      return;
    }
    if (password.length < 6) {
      setLocalError("Password needs at least 6 characters.");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      await onSignUp({ username, password, avatar, bio });
    } else {
      await onLogIn({ username, password });
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1
        style={{
          fontFamily: "'Fredoka', sans-serif",
          fontSize: 34,
          textAlign: "center",
          color: COLORS.pink,
          textShadow: `3px 3px 0 ${COLORS.ink}`,
          marginBottom: 4,
        }}
      >
        What's For Dinner?
      </h1>
      <p style={{ textAlign: "center", color: COLORS.purple, marginBottom: 20 }}>
        rate your grub. tag your chef. get famous 🍝
      </p>
      <Box style={{ padding: 20 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: COLORS.purple,
              fontFamily: "'Fredoka', sans-serif",
              fontSize: 13,
              padding: 0,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← back
          </button>
        )}
        <div style={{ display: "flex", marginBottom: 14, border: `2px solid ${COLORS.ink}`, borderRadius: 10, overflow: "hidden" }}>
          <button
            onClick={() => setMode("signup")}
            style={{
              flex: 1,
              padding: "9px 0",
              border: "none",
              cursor: "pointer",
              fontFamily: "'Fredoka', sans-serif",
              background: mode === "signup" ? COLORS.lime : "#fff",
              color: COLORS.purpleDeep,
            }}
          >
            sign up
          </button>
          <button
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              padding: "9px 0",
              border: "none",
              borderLeft: `2px solid ${COLORS.ink}`,
              cursor: "pointer",
              fontFamily: "'Fredoka', sans-serif",
              background: mode === "login" ? COLORS.lime : "#fff",
              color: COLORS.purpleDeep,
            }}
          >
            log in
          </button>
        </div>

        <label style={label()}>username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="PastaQueen99" style={input()} autoCapitalize="none" />

        <label style={label()}>password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="at least 6 characters" style={input()} />

        {mode === "signup" && (
          <>
            <label style={label()}>pick an avatar</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, marginBottom: 12 }}>
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAvatar(a)}
                  style={{
                    fontSize: 20,
                    padding: 6,
                    borderRadius: 8,
                    border: `2px solid ${COLORS.ink}`,
                    background: avatar === a ? COLORS.lime : "#fff",
                    cursor: "pointer",
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
            <label style={label()}>bio (optional)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="I like it spicy 🌶️"
              style={{ ...input(), height: 60, resize: "none" }}
            />
          </>
        )}

        {(localError || error) && <div style={{ color: COLORS.pinkDark, marginBottom: 8, fontSize: 13 }}>{localError || error}</div>}

        <button disabled={busy || !username || !password} onClick={submit} style={primaryBtn(busy || !username || !password)}>
          {busy ? "just a sec..." : mode === "signup" ? "enter the kitchen →" : "log back in →"}
        </button>

        <p style={{ fontSize: 12, color: COLORS.purple, marginTop: 10, opacity: 0.75 }}>
          Your username + password log you into this exact profile from any device —
          no more duplicate profiles from a cleared browser. Names, posts, and ratings
          are visible to everyone who uses this app.
        </p>
      </Box>
    </div>
  );
}

// Rare fallback: an account exists but its profile row never got created
// (e.g. the network dropped between the two steps at signup).
function ProfileSetup({ onSubmit, error }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [bio, setBio] = useState("");
  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <Box style={{ padding: 20 }}>
        <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 18, marginBottom: 12, color: COLORS.purple }}>
          almost there — finish your profile
        </div>
        <label style={label()}>display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PastaQueen99" style={input()} />
        <label style={label()}>pick an avatar</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, marginBottom: 12 }}>
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => setAvatar(a)}
              style={{
                fontSize: 20,
                padding: 6,
                borderRadius: 8,
                border: `2px solid ${COLORS.ink}`,
                background: avatar === a ? COLORS.lime : "#fff",
                cursor: "pointer",
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <label style={label()}>bio (optional)</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="I like it spicy 🌶️" style={{ ...input(), height: 60, resize: "none" }} />
        {error && <div style={{ color: COLORS.pinkDark, marginBottom: 8, fontSize: 13 }}>{error}</div>}
        <button disabled={!name.trim()} onClick={() => onSubmit({ name, avatar, bio })} style={primaryBtn(!name.trim())}>
          save profile →
        </button>
      </Box>
    </div>
  );
}

function label() {
  return { display: "block", fontSize: 13, color: COLORS.purple, fontWeight: 700, marginBottom: 4, marginTop: 8 };
}
function input() {
  return {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 8,
    border: `2px solid ${COLORS.ink}`,
    fontFamily: "'Comic Neue', cursive",
    fontSize: 15,
    marginBottom: 4,
    boxSizing: "border-box",
  };
}
function primaryBtn(disabled) {
  return {
    width: "100%",
    marginTop: 12,
    padding: "10px 14px",
    background: disabled ? "#ccc" : COLORS.pink,
    color: "#fff",
    border: `2px solid ${COLORS.ink}`,
    borderRadius: 10,
    fontFamily: "'Fredoka', sans-serif",
    fontSize: 16,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : `3px 3px 0 ${COLORS.ink}`,
  };
}

function Header({ onNew, onLogOut }) {
  return (
    <Box
      style={{
        padding: "14px 18px",
        background: `linear-gradient(90deg, ${COLORS.pink}, ${COLORS.orange})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 26, color: "#fff", textShadow: `2px 2px 0 ${COLORS.ink}`, display: "flex", alignItems: "center", gap: 8 }}>
        🍽️ What's For Dinner
        <span
          title="live updates on"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: COLORS.lime,
            boxShadow: "0 0 6px 2px rgba(180,230,0,0.8)",
            display: "inline-block",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={onNew}
          style={{ ...primaryBtn(false), width: "auto", marginTop: 0, background: COLORS.lime, color: COLORS.purpleDeep, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={16} /> share tonight's dinner
        </button>
        <button
          onClick={onLogOut}
          title="log out"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: `2px solid ${COLORS.ink}`,
            borderRadius: 10,
            padding: "9px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <LogOut size={16} color={COLORS.ink} />
        </button>
      </div>
    </Box>
  );
}

function MarqueeTicker({ timeline, directory }) {
  if (!timeline.length) return null;
  const items = timeline.slice(0, 8).map((p) => {
    const a = directory[p.author_id];
    const fives = Object.values(p.ratingsMap).filter((r) => r === 5).length;
    return `${a ? a.name : "someone"} shared "${p.meal}"${fives ? ` — ⭐×${fives}` : ""}`;
  });
  return (
    <div
      style={{
        marginTop: 12,
        background: COLORS.purpleDeep,
        color: COLORS.lime,
        border: `3px solid ${COLORS.ink}`,
        borderRadius: 10,
        padding: "6px 0",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <div className="wfd-ticker" style={{ display: "inline-block", fontFamily: "'Press Start 2P', monospace", fontSize: 10 }}>
        {items.join("     ★     ")}&nbsp;&nbsp;&nbsp;&nbsp;
      </div>
      <style>{`
        .wfd-ticker { animation: wfd-scroll 22s linear infinite; }
        @keyframes wfd-scroll { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        @media (prefers-reduced-motion: reduce) { .wfd-ticker { animation: none !important; } }
      `}</style>
    </div>
  );
}

function ProfileCard({ profile, postsCount }) {
  return (
    <Box style={{ padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>{profile.avatar}</div>
      <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 18, color: COLORS.purple }}>{profile.name}</div>
      {profile.bio && <div style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>{profile.bio}</div>}
      <div style={{ marginTop: 8 }}>
        <PixelBadge>{postsCount} DINNERS</PixelBadge>
      </div>
    </Box>
  );
}

function BestFriendCard({ bestFriend, directory, onView }) {
  const friend = bestFriend ? directory[bestFriend.id] : null;

  return (
    <Box style={{ padding: 14, textAlign: "center", background: friend ? `linear-gradient(160deg, ${COLORS.gold}, #fff)` : COLORS.panel }}>
      <div style={{ fontFamily: "'Fredoka', sans-serif", color: COLORS.purple, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Crown size={16} /> best friend
      </div>
      {friend ? (
        <button
          onClick={() => onView(friend.id)}
          style={{ background: "none", border: "none", cursor: "pointer", width: "100%" }}
        >
          <div style={{ fontSize: 46 }}>{friend.avatar}</div>
          <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 16, color: COLORS.ink }}>{friend.name}</div>
          <div style={{ marginTop: 6 }}>
            <PixelBadge>{bestFriend.score} INTERACTIONS</PixelBadge>
          </div>
        </button>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          rate, react to, or cook for a friend's dinner to earn a best friend spot
        </div>
      )}
    </Box>
  );
}

function NavBox({ tab, setTab }) {
  const items = [
    { key: "feed", label: "timeline", icon: Home },
    { key: "friends", label: "friends", icon: Users },
    { key: "hall", label: "5★ wall", icon: Trophy },
    { key: "profile", label: "my profile", icon: User },
  ];
  return (
    <Box style={{ padding: 8 }}>
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            marginBottom: 4,
            borderRadius: 8,
            border: "none",
            background: tab === key ? COLORS.lime : "transparent",
            fontFamily: "'Fredoka', sans-serif",
            color: COLORS.purple,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </Box>
  );
}

function MealOfWeek({ entry, author }) {
  const { p, fives } = entry;
  return (
    <Box style={{ padding: 16, marginBottom: 16, background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.orange})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Trophy size={22} color={COLORS.purpleDeep} />
        <span style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 18, color: COLORS.purpleDeep }}>Meal of the Week</span>
      </div>
      <div style={{ fontSize: 15 }}>
        <b>{author.avatar} {author.name}</b>'s <b>{p.meal}</b> — {fives} five-star rating{fives > 1 ? "s" : ""} this week!
      </div>
      <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85 }}>
        Recipe pending — the What's For Dinner team reaches out to five-star cooks personally. 🏅
      </div>
    </Box>
  );
}

function Feed({ posts, author, profile, onRate, onReact, onViewProfile }) {
  if (!posts.length) {
    return (
      <Box style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 32 }}>🍽️</div>
        <div style={{ fontFamily: "'Fredoka', sans-serif", color: COLORS.purple }}>the table's empty</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>be the first to share what's for dinner!</div>
      </Box>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {posts.map((p, i) => (
        <PostCard
          key={p.id}
          post={p}
          author={author(p.author_id)}
          chef={p.chef_id ? author(p.chef_id) : null}
          profile={profile}
          onRate={onRate}
          onReact={onReact}
          onViewProfile={onViewProfile}
          tilt={i % 2 === 0 ? -0.4 : 0.4}
        />
      ))}
    </div>
  );
}

function PostCard({ post, author, chef, profile, onRate, onReact, onViewProfile, tilt }) {
  const ratings = Object.values(post.ratingsMap);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
  const myRating = post.ratingsMap[profile.id] || 0;
  const reactionCounts = REACTIONS.map((r) => ({
    ...r,
    count: Object.values(post.reactionsMap).filter((v) => v === r.key).length,
    mine: post.reactionsMap[profile.id] === r.key,
  }));

  return (
    <Box style={{ padding: 16 }} tilt={tilt}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={() => onViewProfile(post.author_id)} style={{ fontSize: 30, background: "none", border: "none", cursor: "pointer" }}>
          {author.avatar}
        </button>
        <div style={{ flex: 1 }}>
          <button
            onClick={() => onViewProfile(post.author_id)}
            style={{ fontFamily: "'Fredoka', sans-serif", color: COLORS.purple, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 15 }}
          >
            {author.name}
          </button>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{timeAgo(post.created_at)}</div>
        </div>
        {post.mood && <div style={{ fontSize: 22 }}>{post.mood}</div>}
      </div>

      {post.image_url && <PhotoFrame frame={post.frame} src={post.image_url} alt={post.meal} height={280} />}

      <div style={{ marginTop: 10, fontFamily: "'Fredoka', sans-serif", fontSize: 19, color: COLORS.ink }}>{post.meal}</div>
      {post.description && <div style={{ marginTop: 4, fontSize: 14 }}>{post.description}</div>}

      {chef && (
        <div style={{ marginTop: 8 }}>
          <PixelBadge bg={COLORS.lime}>
            <ChefHat size={9} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            COOKED BY {chef.name.toUpperCase()}
          </PixelBadge>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onRate(post.id, n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} title={`${n} star${n > 1 ? "s" : ""}`}>
            <Star size={22} fill={n <= myRating ? COLORS.gold : "none"} color={n <= myRating ? COLORS.gold : COLORS.ink} />
          </button>
        ))}
        {avg && <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.7 }}>{avg} avg ({ratings.length})</span>}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {reactionCounts.map((r) => (
          <button
            key={r.key}
            onClick={() => onReact(post.id, r.key)}
            title={r.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              padding: "5px 9px",
              borderRadius: 20,
              border: `2px solid ${COLORS.ink}`,
              background: r.mine ? COLORS.pink : "#fff",
              color: r.mine ? "#fff" : COLORS.ink,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 15 }}>{r.emoji}</span>
            {r.count > 0 && <span>{r.count}</span>}
          </button>
        ))}
      </div>
    </Box>
  );
}

function FriendsTab({ directory, friends, profile, onAdd, onRemove, onView }) {
  const others = Object.values(directory).filter((d) => d.id !== profile.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Box style={{ padding: 16 }}>
        <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 18, color: COLORS.purple, marginBottom: 10 }}>everyone in the kitchen</div>
        {others.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>nobody else has joined yet — invite your friends!</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {others.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: `2px solid ${COLORS.ink}`, borderRadius: 10 }}>
              <button onClick={() => onView(d.id)} style={{ fontSize: 24, background: "none", border: "none", cursor: "pointer" }}>{d.avatar}</button>
              <div style={{ flex: 1 }}>
                <button onClick={() => onView(d.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Fredoka', sans-serif", color: COLORS.purple }}>
                  {d.name}
                </button>
              </div>
              {friends.includes(d.id) ? (
                <button onClick={() => onRemove(d.id)} style={smallBtn(false)}>friends ✓</button>
              ) : (
                <button onClick={() => onAdd(d.id)} style={smallBtn(true)}>add friend</button>
              )}
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
}
function smallBtn(active) {
  return {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 16,
    border: `2px solid ${COLORS.ink}`,
    background: active ? COLORS.lime : "#fff",
    cursor: "pointer",
    fontFamily: "'Fredoka', sans-serif",
  };
}

function HallOfFame({ posts, author }) {
  return (
    <Box style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 18, color: COLORS.purple, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Sparkles size={18} /> five-star wall
      </div>
      {posts.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>no five-star meals yet — get rating!</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map((p) => {
          const a = author(p.author_id);
          const fives = Object.values(p.ratingsMap).filter((r) => r === 5).length;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: `2px solid ${COLORS.ink}`, borderRadius: 10 }}>
              <span style={{ fontSize: 22 }}>{a.avatar}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 14 }}>{p.meal}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>by {a.name}</div>
              </div>
              <PixelBadge>★×{fives}</PixelBadge>
            </div>
          );
        })}
      </div>
    </Box>
  );
}

function ProfilePage({ person, posts, isMe, isFriend, onAddFriend }) {
  return (
    <div>
      <Box style={{ padding: 18, textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 50 }}>{person.avatar}</div>
        <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 22, color: COLORS.purple }}>{person.name}</div>
        {person.bio && <div style={{ fontSize: 13, marginTop: 4 }}>{person.bio}</div>}
        {!isMe && !isFriend && onAddFriend && (
          <button onClick={onAddFriend} style={{ ...primaryBtn(false), width: "auto", marginTop: 12 }}>
            + add friend
          </button>
        )}
      </Box>
      <div style={{ fontFamily: "'Fredoka', sans-serif", color: COLORS.purple, marginBottom: 8 }}>
        {isMe ? "your" : `${person.name}'s`} dinners ({posts.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {posts.map((p) => {
          const ratings = Object.values(p.ratingsMap);
          const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
          return (
            <Box key={p.id} style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.meal}
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `2px solid ${COLORS.ink}`, flexShrink: 0 }}
                />
              )}
              <div>
                <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 15 }}>{p.meal}</div>
                {p.description && <div style={{ fontSize: 13, marginTop: 2 }}>{p.description}</div>}
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{timeAgo(p.created_at)} · ⭐ {avg}</div>
              </div>
            </Box>
          );
        })}
        {posts.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>no dinners shared yet</div>}
      </div>
    </div>
  );
}

function Composer({ friends, directory, onSubmit }) {
  const [meal, setMeal] = useState("");
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState("");
  const [chefId, setChefId] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [frame, setFrame] = useState("none");
  const fileInputRef = useRef(null);

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("That's not an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Photo's too big — keep it under ${MAX_IMAGE_MB}MB.`);
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressImage(file);
      setImageFile(compressed);
      setImagePreview(URL.createObjectURL(compressed));
    } catch {
      // Compression failed (unsupported format, etc.) — fall back to the original file.
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } finally {
      setCompressing(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    setPosting(true);
    await onSubmit({ meal, description, mood, chefId, imageFile, frame });
    setPosting(false);
  }

  return (
    <div>
      <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 20, color: COLORS.purple, marginBottom: 12 }}>
        what's for dinner tonight? 🍽️
      </div>

      <label style={label()}>photo</label>
      {imagePreview ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ position: "relative" }}>
            <PhotoFrame frame={frame} src={imagePreview} alt="preview" height={200} />
            <button
              onClick={clearImage}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                background: "#fff",
                border: `2px solid ${COLORS.ink}`,
                borderRadius: "50%",
                width: 28,
                height: 28,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3,
              }}
            >
              <X size={14} />
            </button>
            {imageFile && (
              <div style={{ position: "absolute", bottom: 6, left: 6, zIndex: 3 }}>
                <PixelBadge bg={COLORS.lime}>{(imageFile.size / 1024 / 1024).toFixed(1)}MB</PixelBadge>
              </div>
            )}
          </div>

          <label style={label()}>pick a frame</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FRAMES.map((f) => (
              <button
                key={f.key}
                onClick={() => setFrame(f.key)}
                title={f.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  padding: "6px 9px",
                  borderRadius: 16,
                  border: `2px solid ${COLORS.ink}`,
                  background: frame === f.key ? COLORS.lime : "#fff",
                  cursor: "pointer",
                  fontFamily: "'Fredoka', sans-serif",
                }}
              >
                <span>{f.swatch}</span>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing}
          style={{
            width: "100%",
            padding: "18px 10px",
            marginBottom: 8,
            borderRadius: 10,
            border: `2px dashed ${COLORS.ink}`,
            background: "#fff",
            cursor: compressing ? "wait" : "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            color: COLORS.purple,
            fontFamily: "'Fredoka', sans-serif",
          }}
        >
          {compressing ? (
            <>
              <Loader2 size={22} className="wfd-spin" />
              compressing photo...
            </>
          ) : (
            <>
              <Camera size={22} />
              add a photo of the food
            </>
          )}
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFilePick} style={{ display: "none" }} />
      {imageError && <div style={{ color: COLORS.pinkDark, fontSize: 12, marginBottom: 6 }}>{imageError}</div>}

      <label style={label()}>meal name</label>
      <input value={meal} onChange={(e) => setMeal(e.target.value)} placeholder="Grandma's Lasagna" style={input()} />
      <label style={label()}>tell us about it</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="extra cheesy, took 3 hours, worth it" style={{ ...input(), height: 60, resize: "none" }} />
      <label style={label()}>mood (optional)</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {["😋", "🥵", "😴", "🎉", "😭", "🤤"].map((m) => (
          <button key={m} onClick={() => setMood(mood === m ? "" : m)} style={{ fontSize: 18, padding: 6, borderRadius: 8, border: `2px solid ${COLORS.ink}`, background: mood === m ? COLORS.lime : "#fff", cursor: "pointer" }}>
            {m}
          </button>
        ))}
      </div>
      {friends.length > 0 && (
        <>
          <label style={label()}>did a friend cook it?</label>
          <select value={chefId} onChange={(e) => setChefId(e.target.value)} style={input()}>
            <option value="">nope, I cooked it myself</option>
            {friends.map((id) => (
              <option key={id} value={id}>{directory[id]?.name || "unknown"}</option>
            ))}
          </select>
        </>
      )}
      <button disabled={!meal.trim() || posting || compressing} onClick={handleSubmit} style={{ ...primaryBtn(!meal.trim() || posting || compressing), display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {posting ? (
          <>
            <Loader2 size={16} className="wfd-spin" /> uploading...
          </>
        ) : (
          "post it to the table →"
        )}
      </button>
      <style>{`
        .wfd-spin { animation: wfd-spin 0.8s linear infinite; }
        @keyframes wfd-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(58,27,84,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <Box style={{ padding: 20, position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} color={COLORS.ink} />
          </button>
          {children}
        </Box>
      </div>
    </div>
  );
}

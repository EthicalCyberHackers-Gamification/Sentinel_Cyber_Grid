/**
 * lib/supabaseClient.js
 * ---------------------
 * Phase B0 — Supabase backend foundation (LOCAL-FIRST).
 *
 * Creates a single shared Supabase browser client and the anonymous player
 * identity used to key all cloud rows. Everything here is best-effort: if the
 * connection info is missing the module runs in "local-only mode" and exports a
 * null client. Gameplay never depends on any of this.
 *
 * No authentication: we use the public anon key (protected by Row Level
 * Security on the Supabase side) plus a locally-generated anonymous id.
 */

import { createClient } from "@supabase/supabase-js";

/* Injected at build/dev time by vite.config.ts `define` (Replit secrets live in
   process.env, not VITE_-prefixed .env files). Empty string when unset. */
const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.SUPABASE_URL) || "";
const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.SUPABASE_ANON_KEY) || "";

const ANON_ID_KEY = "ech.anon_id";

/** True when both connection values are present. */
export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * The shared Supabase client, or null in local-only mode. No session
 * persistence / token refresh — we never sign users in.
 */
export const supabase = isBackendConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!isBackendConfigured) {
  // eslint-disable-next-line no-console
  console.log(
    "[backend] SUPABASE_URL / SUPABASE_ANON_KEY not set — Running in local-only mode",
  );
}

/* ------------------------------------------------------------------ *
 * Anonymous player identity
 * ------------------------------------------------------------------ */

function randomHex(bytes) {
  try {
    const arr = new Uint8Array(bytes);
    (globalThis.crypto || window.crypto).getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    // Fallback if crypto is unavailable.
    let s = "";
    for (let i = 0; i < bytes * 2; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
}

/**
 * Return this browser's stable anonymous id, creating + persisting one on first
 * launch (e.g. "anon_7fd92a8b21"). Never regenerated on refresh.
 */
export function getOrCreateAnonymousId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (id && typeof id === "string" && id.startsWith("anon_")) return id;
    id = `anon_${randomHex(5)}`;
    localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch (_) {
    // localStorage disabled — fall back to an ephemeral per-session id.
    return `anon_${randomHex(5)}`;
  }
}

/* ------------------------------------------------------------------ *
 * Backend status indicator (subtle, developer-focused)
 * ------------------------------------------------------------------ */

/** @typedef {"local" | "connected" | "delayed"} BackendStatus */

const STATUS_TEXT = {
  local: "Backend: Local Only",
  connected: "Backend: Supabase Connected",
  delayed: "Backend: Sync Delayed",
};

let currentStatus = isBackendConfigured ? "connected" : "local";
let indicatorEl = null;

function renderIndicator() {
  if (!indicatorEl) return;
  indicatorEl.textContent = STATUS_TEXT[currentStatus] || STATUS_TEXT.local;
  indicatorEl.dataset.status = currentStatus;
}

/** Inject the indicator styles once. */
function ensureIndicatorStyles() {
  if (document.getElementById("ech-backend-indicator-style")) return;
  const style = document.createElement("style");
  style.id = "ech-backend-indicator-style";
  style.textContent = `
    .ech-backend-indicator{
      position:fixed; left:10px; bottom:10px; z-index:9990;
      font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      letter-spacing:.02em; padding:3px 8px; border-radius:999px;
      background:rgba(8,12,20,.62); color:#9fb3c8;
      border:1px solid rgba(120,160,200,.18); backdrop-filter:blur(4px);
      opacity:.45; transition:opacity .2s ease; pointer-events:auto;
      user-select:none; cursor:default;
    }
    .ech-backend-indicator:hover{opacity:.95;}
    .ech-backend-indicator::before{
      content:""; display:inline-block; width:7px; height:7px; margin-right:6px;
      border-radius:50%; vertical-align:middle; background:#6b7a8c;
    }
    .ech-backend-indicator[data-status="connected"]{color:#7fd6a0;}
    .ech-backend-indicator[data-status="connected"]::before{background:#36d17a;}
    .ech-backend-indicator[data-status="delayed"]{color:#e6c074;}
    .ech-backend-indicator[data-status="delayed"]::before{background:#e0a92e;}
    .ech-backend-indicator[data-status="local"]{color:#9fb3c8;}
    .ech-backend-indicator[data-status="local"]::before{background:#6b7a8c;}
  `;
  document.head.appendChild(style);
}

/** Mount the subtle status pill (idempotent). Safe to call after DOM is ready. */
export function mountBackendStatusIndicator() {
  try {
    if (indicatorEl) return;
    ensureIndicatorStyles();
    indicatorEl = document.createElement("div");
    indicatorEl.className = "ech-backend-indicator";
    indicatorEl.title =
      "Developer indicator — gameplay always saves locally first. Hover to read.";
    renderIndicator();
    document.body.appendChild(indicatorEl);
  } catch (_) {
    /* non-fatal */
  }
}

/** Update the backend status (no-op in local-only mode). */
export function setBackendStatus(status) {
  if (!isBackendConfigured) status = "local";
  if (status === currentStatus) return;
  if (status !== "connected" && status !== "delayed" && status !== "local") return;
  currentStatus = status;
  renderIndicator();
}

export function getBackendStatus() {
  return currentStatus;
}

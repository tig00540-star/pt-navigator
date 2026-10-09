// lib/reportError.js — 화면 오류를 서버(/api/client-error)로 보낸다(2026-10-08 · 브라우저 전용).
//   같은 메시지는 한 번 열린 동안 한 번만 · 브라우저 확장 프로그램 · 의미 없는 잡음은 거른다. 실패해도 조용히.
const sent = new Set();
const NOISE = /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection|Load failed$|NetworkError when attempting|Failed to fetch$|AbortError|The operation was aborted/i;

const roleOf = (path) => (path.startsWith("/m/") ? "member" : path.startsWith("/admin") ? "owner" : /^\/(lp|center|check|try|download|join|legal|login|signup)?(\/|$)/.test(path) && path !== "/" ? "public" : "trainer");

export function reportError(message, { digest = null } = {}) {
  try {
    if (typeof window === "undefined") return;
    const msg = String(message || "").slice(0, 500);
    if (!msg || NOISE.test(msg) || sent.has(msg) || sent.size > 30) return;
    sent.add(msg);
    const path = window.location.pathname;
    const body = JSON.stringify({ message: msg, path, digest, role: roleOf(path) });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* 무시 */ }
}

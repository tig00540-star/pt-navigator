// lib/opsLog.js — 앱 오류 모으기(2026-10-08 · 서버 전용 · app_error 표).
//   같은 오류는 fingerprint(어디서 + 메시지 모양)로 묶는다. 주소의 회원 토큰 · id · 숫자는 지워서 남긴다(개인정보 안 남김).
//   한 서버(인스턴스)에서 같은 오류는 1시간에 20번까지만 적는다(폭주 방지). 표가 없으면(SQL 전) 조용히 건너뛴다.
import crypto from "crypto";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** 주소 → 묶을 수 있는 모양("/m/[token]" · "/pt/[id]/write") · 검색어 · 해시 제거 */
export function normPath(p) {
  let s = String(p || "").split(/[?#]/)[0].slice(0, 200);
  s = s.replace(/^https?:\/\/[^/]+/, "");
  s = s.replace(/^\/m\/[^/]+/, "/m/[token]").replace(/^\/join\/[^/]+/, "/join/[code]").replace(/^\/join-center\/[^/]+/, "/join-center/[code]");
  return s.replace(UUID, "[id]").replace(/\/\d+(?=\/|$)/g, "/[n]") || "/";
}

/** 메시지 → 숫자 · id · 따옴표 안 값을 지운 모양(같은 오류끼리 묶기) */
export function normMessage(m) {
  return String(m || "").slice(0, 300).replace(UUID, "[id]").replace(/\d{3,}/g, "[n]").replace(/"[^"]{20,}"/g, '"…"').trim();
}

const seen = new Map(); // fingerprint → [ms...]
function allow(fp) {
  const now = Date.now();
  const arr = (seen.get(fp) || []).filter((t) => now - t < 3600000);
  if (arr.length >= 20) return false;
  arr.push(now); seen.set(fp, arr);
  if (seen.size > 500) seen.delete(seen.keys().next().value);
  return true;
}

/** @param sb service_role 클라 · @param e {source:'client'|'server'|'cron', path, message, digest?, role?} */
export async function recordError(sb, { source, path, message, digest = null, role = null }) {
  if (!sb) return;
  const p = normPath(path), msg = normMessage(message);
  const fp = crypto.createHash("sha1").update(`${source}|${p}|${msg.slice(0, 160)}`).digest("hex").slice(0, 16);
  if (!allow(fp)) return;
  try {
    await sb.from("app_error").insert({ source, fingerprint: fp, path: p, message: msg, digest: digest ? String(digest).slice(0, 60) : null, role: role ? String(role).slice(0, 20) : null });
  } catch { /* 표 없음 · 연결 실패 — 오류 기록이 앱을 멈추면 안 된다 */ }
}

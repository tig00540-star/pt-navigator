"use client";

/* 홈페이지 조회수(Vercel Web Analytics · 2026-10-14) — 공개 페이지만 센다.
   - 앱 화면(/ot/{회원} · /pt/{회원} …)과 회원 전용 페이지(/m/{토큰})는 주소에 회원 번호 · 토큰이 들어 있어 보내지 않는다.
   - "/"는 로그아웃 방문자에겐 소개 화면, 로그인한 트레이너에겐 앱 홈이라 → 로그인 세션이 있으면 세지 않는다.
   - 주소의 ?뒤는 utm_* 만 남긴다(다른 값이 실려 나가지 않게). /join/{코드}는 코드를 지우고 한 줄로 묶는다.
   - 쿠키를 쓰지 않는다. 무료(Hobby) 한도 = 계정 전체 월 5만 건(넘으면 다음 달까지 수집만 멈춤 · 요금 없음). */

import { Analytics } from "@vercel/analytics/next";

const EXACT = new Set(["/", "/lp", "/center", "/download", "/signup"]);
const PREFIX = ["/legal/", "/try", "/check", "/join/"];

function signedIn() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (/^sb-.+-auth-token$/.test(k)) return true;
    }
  } catch {
    // 저장소를 못 읽으면(사생활 모드 등) 로그아웃으로 본다 — 공개 페이지인지는 주소로 이미 걸렀다
  }
  return false;
}

function beforeSend(event) {
  let u;
  try { u = new URL(event.url); } catch { return null; }
  let path = u.pathname.replace(/\/+$/, "") || "/";
  const isPublic = EXACT.has(path) || PREFIX.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p));
  if (!isPublic) return null;
  if (path === "/" && signedIn()) return null;
  if (path.startsWith("/join/")) path = "/join/[code]";
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (k.startsWith("utm_")) keep.set(k, v);
  const qs = keep.toString();
  return { ...event, url: `${u.origin}${path}${qs ? `?${qs}` : ""}` };
}

export default function PublicAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}

// app/api/client-error/route.js — 화면(브라우저) 오류 받기(2026-10-08 · 앱 운영 · 로그인 없어도 됨).
//   받는 것: 메시지 · 주소 모양 · digest · 어느 화면(trainer/member/public). 회원 이름 · 번호는 안 받는다(lib/opsLog가 주소 토큰도 지움).
//   한 곳(IP)에서 1분 30건까지 · 글 길이 제한. 저장 실패해도 204(화면에 영향 없음).
import { serviceClient } from "@/lib/serverCaller";
import { recordError } from "@/lib/opsLog";

export const runtime = "nodejs";

const HITS = new Map();
function ok(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 30) return false;
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 2000) HITS.delete(HITS.keys().next().value);
  return true;
}

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "x";
  if (!ok(ip)) return new Response(null, { status: 204 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b.message !== "string" || !b.message.trim()) return new Response(null, { status: 204 });
  await recordError(serviceClient(), {
    source: "client",
    path: typeof b.path === "string" ? b.path : "",
    message: b.message.slice(0, 500),
    digest: typeof b.digest === "string" ? b.digest : null,
    role: ["trainer", "owner", "member", "public"].includes(b.role) ? b.role : null,
  });
  return new Response(null, { status: 204 });
}

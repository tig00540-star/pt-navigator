// lib/requireTrainer.js — 서버 전용(라우트에서만 import). AI 라우트 인증+레이트리밋 공용.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 인메모리 스로틀(uid별 슬라이딩 윈도). ⚠️ 서버리스 = 인스턴스별·콜드스타트 리셋(best-effort).
// anon 남용은 인증이 이미 막으므로, 이건 '정상 트레이너 폭주' 2차 방어.
const HITS = new Map(); // uid -> number[] (ms 타임스탬프)
function throttle(uid, limit = 20, windowMs = 60000) {
  const now = Date.now();
  const arr = (HITS.get(uid) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  HITS.set(uid, arr);
  return true;
}

/** 로그인 활성 트레이너 검증 + 스로틀. 데모 모드(키 없음)면 인증 스킵({ok:true, user:null}). */
export async function requireTrainer(request) {
  // 데모 모드: Supabase 미설정이면 앱도 데모라 게이트 없음 → 인증 스킵(기존 동작 보존).
  if (!url || !anon) return { ok: true, user: null };

  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { ok: false, res: Response.json({ error: "인증 필요" }, { status: 401 }) };

  // 유저 토큰을 실은 클라이언트 → getUser로 JWT 검증 + trainer 본인 행은 RLS(id=auth.uid())로 조회.
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return { ok: false, res: Response.json({ error: "세션 무효" }, { status: 401 }) };

  // 활성 트레이너인지(오프보딩 방어 · B와 이중 방어). 비활성/미등록 = 403.
  const { data: t } = await sb.from("trainer").select("active").eq("id", u.user.id).maybeSingle();
  if (!t || t.active !== true) {
    return { ok: false, res: Response.json({ error: "권한 없음(비활성/미등록 트레이너)" }, { status: 403 }) };
  }

  if (!throttle(u.user.id)) {
    return { ok: false, res: Response.json({ error: "요청이 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 }) };
  }
  return { ok: true, user: u.user };
}

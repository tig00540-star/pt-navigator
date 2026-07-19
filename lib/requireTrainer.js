// lib/requireTrainer.js — 서버 전용(라우트에서만 import). AI 라우트 인증+레이트리밋 공용.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEMO = process.env.DEMO_MODE === "1"; // 명시적 데모 옵트인(키 부재만으로는 인증 스킵 안 함)

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

/** 로그인 활성+구독 트레이너 검증 + 스로틀. 키부재+DEMO_MODE=1이면 인증 스킵. */
export async function requireTrainer(request) {
  // 데모 모드: 키 부재 + 명시 옵트인(DEMO_MODE=1)일 때만 인증 스킵.
  // 그 외 키 부재 = 설정 오류로 보고 fail-closed(503) + 서버 로그(무음 방지).
  if (!url || !anon) {
    if (DEMO) return { ok: true, user: null };
    console.error("[requireTrainer] Supabase 환경변수 누락 + DEMO_MODE 미설정 → 503 (fail-closed)");
    return { ok: false, res: Response.json({ error: "서버 설정 오류" }, { status: 503 }) };
  }

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

  // 구독 활성 계정인지(층1 결제벽의 API 쪽 · UI AuthGate와 동일 출처 my_account_status).
  // access = subscription_status='active' AND (current_period_end IS NULL OR > now()).
  // ⚠️ access는 trainer.active를 포함하지 않으므로 위 active 검사와 별개로 둘 다 필요.
  const { data: st, error: se } = await sb.rpc("my_account_status");
  if (se || st?.[0]?.access !== true) {
    return { ok: false, res: Response.json({ error: "구독이 필요합니다." }, { status: 403 }) };
  }

  if (!throttle(u.user.id)) {
    return { ok: false, res: Response.json({ error: "요청이 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 }) };
  }
  return { ok: true, user: u.user };
}

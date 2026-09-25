/* =========================================================================
   otCache — OT(1차) 행의 report jsonb를 AI 결과 캐시 자리로 쓰는 공용 헬퍼.

   ── 왜 ot_log.report인가 ──
   1차 사전무장(report.first_assist)·2차 브리핑·재등록 브리핑이 이미 같은 방식으로
   "생성한 AI 결과를 그 회원의 기록 행에 얹어두고, 다시 들어오면 그대로 읽는다".
   인바디·체형 분석만 캐시가 없어 화면을 다시 열 때마다 AI를 새로 호출했다.
   같은 패턴을 쓰면 새 테이블도 마이그레이션도 필요 없다.

   ── 규율 ──
   · 저장은 항상 스프레드 병합 — report를 통째로 갈아끼우면 관찰·first_assist가 날아간다.
   · update에는 .select()를 붙이고 0행이면 실패로 본다(교훈1 하드닝 · RLS 차단은 error가 아니라 0행).
   · 1차 행이 없으면 캐시를 건너뛴다(여기서 행을 만들지 않는다 — FirstOTAssist가 만드는
     행과 경쟁해 중복 행이 생길 수 있다). 캐시가 없으면 그 화면에서만 보이고 사라질 뿐이다.
   ========================================================================= */
import { supabase } from "@/lib/supabaseClient";

// 회원의 최신 1차(ot_round=1) 행 — { id, report } 또는 null.
export async function loadOtRound1(memberId) {
  if (!supabase || !memberId) return null;
  const { data } = await supabase
    .from("ot_log")
    .select("id, report")
    .eq("user_id", memberId)
    .eq("ot_round", 1)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

// report[key] = value 로 병합 저장. 성공하면 병합된 report, 실패·행없음이면 null.
export async function saveOtRound1Key(row, key, value) {
  if (!supabase || !row?.id) return null;
  const merged = { ...(row.report || {}), [key]: value };
  const { data } = await supabase
    .from("ot_log")
    .update({ report: merged })
    .eq("id", row.id)
    .select();
  if (!data || data.length === 0) return null; // RLS/정책 차단 포함
  return merged;
}

// 캐시가 지금 입력과 같은 것을 보고 만든 결과인지. 다르면 안 쓴다(오래된 분석 표시 금지).
export function cacheFor(cached, sourceId) {
  if (!cached?.data || !sourceId) return null;
  return cached?.meta?.sourceId === sourceId ? cached.data : null;
}

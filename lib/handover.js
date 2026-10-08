// lib/handover.js — 회원 담당 넘기기(트레이너 인계) 한 명 · 클라이언트(대표 세션 · RLS).
//   운영 탭 '회원 재배정'(한 명) · '트레이너 끄기 → 한꺼번에 넘기기'(2026-10-08)가 같이 쓴다.
//   순서: ① 남은 수업이 있으면 새 담당 이월계약(handover · 매출 0) ② 옛 계약 잔여 닫기(handed_over)
//         ③ 담당 바꾸기 ④(옵션) 잡힌 예약도 새 담당으로.
//   지난 수업 · 매출은 옛 계약에 그대로 · 급여는 계약 trainer_id 기준이라 잔여분만 새 담당.
import { activeContract, remainingSessions, buildContract } from "@/lib/memberStatus";

/** 회원의 지금 남은 수업 · 단가(이월계약 기본값) */
export function handoverDefaults(memberId, contracts, logs) {
  const mc = (contracts || []).filter((c) => c.user_id === memberId);
  const act = activeContract(mc, logs);
  const r = act ? remainingSessions(act, logs) : null;
  const sessions = r && r.total > 0 ? r.total : 0;
  let price = Number(act?.price_per_session) || 0;
  if (!price && act?.amount_total && act?.sessions_total) price = Math.round(Number(act.amount_total) / Number(act.sessions_total));
  return { sessions, price, memberContracts: mc };
}

/**
 * @returns {Promise<{ok:true} | {ok:false, step:number, msg:string}>}
 *   sessions · price를 주지 않으면 지금 남은 수업 · 단가로.
 */
export async function handoverMember(supabase, { member, toTrainerId, contracts, logs, sessions, price, moveAppts = true }) {
  const def = handoverDefaults(member.id, contracts, logs);
  const n = sessions ?? def.sessions;
  const p = price ?? def.price;
  if (n > 0 && !(p > 0)) return { ok: false, step: 0, msg: "남은 수업이 있는데 회당 단가가 없어요. 한 명씩 넘기면서 단가를 적어 주세요." };

  if (n > 0) {
    const payload = {
      ...buildContract({ userId: member.id, origin: "handover", sessions_total: n, price_per_session: p, amount_total: null, service_sessions: 0 }),
      trainer_id: toTrainerId,
    };
    const { data, error } = await supabase.from("session_log").insert(payload).select();
    if (error || !data?.length) return { ok: false, step: 1, msg: "이월계약을 만들지 못했어요. 아직 아무것도 바뀌지 않았으니 다시 시도해 주세요." };
    for (const c of def.memberContracts.filter((c) => remainingSessions(c, logs).total > 0)) {
      const { data: u, error: e2 } = await supabase.from("session_log").update({ handed_over: true }).eq("id", c.id).select();
      if (e2 || !u?.length) return { ok: false, step: 2, msg: "기존 계약을 닫지 못했어요. 이월계약은 만들어졌으니 다시 실행하지 말고 잔여를 확인한 뒤 마무리해 주세요." };
    }
  }
  const { data: um, error: e3 } = await supabase.from("user_table").update({ trainer_id: toTrainerId }).eq("id", member.id).select();
  if (e3 || !um?.length) return { ok: false, step: 3, msg: "담당을 옮기지 못했어요. 계약은 옮겨졌으니 이 회원 담당만 다시 지정해 주세요." };
  if (moveAppts) {
    const { error: e4 } = await supabase.from("appointment").update({ trainer_id: toTrainerId }).eq("user_id", member.id).eq("status", "booked").select();
    if (e4) return { ok: false, step: 4, msg: "예약을 옮기지 못했어요. 담당 · 계약은 옮겨졌으니 예약은 스케줄에서 직접 옮겨 주세요." };
  }
  return { ok: true };
}

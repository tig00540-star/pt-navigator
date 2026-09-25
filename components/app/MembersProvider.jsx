"use client";

/* =========================================================================
   MembersProvider — 회원 목록과 그에 딸린 쓰기 동작을 앱 한 곳에서 소유한다.

   ── 왜 위로 올렸나 ──
   화면을 주소로 나누면 화면마다 회원 목록을 따로 불러오게 된다. 같은 데이터를
   여러 번 조회할 뿐 아니라, 등록 확정 같은 낙관적 갱신이 화면마다 어긋난다.
   그래서 레이아웃에서 한 번 불러 모든 화면이 같은 배열을 본다(기존 page.jsx 코드를 그대로 옮김).

   ── 규율 ──
   · 모든 write는 .select() 후 0행이면 실패(교훈1 하드닝) — RLS 차단은 error가 아니라 0행이다.
   · setState는 async 안에서만(react-hooks/set-state-in-effect 회피).
   ========================================================================= */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toPtActive, buildContract } from "@/lib/memberStatus";

// 데모(키 미설정) 회원 — 키 없이 실행할 때 화면이 비지 않게 하는 용도.
export const DEMO_MEMBER = {
  id: "demo",
  name: "김철수",
  age: 34,
  job: "IT 개발자",
  residence: "센터 인근 오피스텔",
  mbti: "ISTJ",
  pain: "우측 무릎 통증",
  goal: "바디프로필",
  status: "ot_active",
  origin: "ot_funnel",
  pt_direction: "고관절 가동성 회복 + 무릎 부하 분산 (데모)",
  summary: [
    "논리와 근거로 움직이는 실용주의자 — '왜'가 해결되면 즉시 실행에 옮기는 결과지향형.",
    "장시간 좌식 근무로 고관절 굴곡근 단축 추정 → 우측 무릎에 누적 부하가 걸릴 구조.",
    "목표(바디프로필)가 명확 → 감성 어필보다 수치·마일스톤·역산 계획에 강하게 반응.",
  ],
};

/* Supabase user_table 한 행 → 화면이 기대하는 회원 형태로 매핑 */
export function mapMemberRow(r) {
  return {
    id: r.id,
    name: r.name,
    phone_number: r.phone_number ?? null,
    age: r.age ?? "-",
    job: r.job ?? "-",
    residence: r.residence ?? "-",
    mbti: r.mbti ?? "-",
    gender: r.gender ?? null,
    pain: r.pain ?? "-",
    goal: r.goal ?? "미설정",
    goal_deadline: r.goal_deadline ?? null,
    training_pace: r.training_pace ?? null,
    injury_history: r.injury_history ?? null,
    exercise_level: r.exercise_level ?? null,
    quit_reason: r.quit_reason ?? null,
    past_exercise: r.past_exercise ?? null,
    availability: r.availability ?? null,
    activity_level: r.activity_level ?? null,
    member_note: r.member_note ?? null,
    machines: r.machines ?? [],
    trainer_id: r.trainer_id ?? null,
    member_token: r.member_token ?? null,
    member_auth_id: r.member_auth_id ?? null,
    status: r.status ?? "ot_active",
    origin: r.origin ?? "ot_funnel",
    pt_direction: r.pt_direction ?? "",
    status_changed_at: r.status_changed_at ?? null,
    status_note: r.status_note ?? null,
    summary: r.name === DEMO_MEMBER.name
      ? DEMO_MEMBER.summary
      : ["AI 성향 요약은 회원 데이터를 바탕으로 곧 생성됩니다."],
  };
}

const Ctx = createContext(null);

export function useMembers() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMembers는 MembersProvider 안에서만 쓸 수 있어요.");
  return v;
}

export default function MembersProvider({ children }) {
  const [members, setMembers] = useState([]);
  const [ready, setReady] = useState(false); // 첫 조회 완료 — 회원 화면이 '없음' 판정을 늦추는 근거
  const [dbNote, setDbNote] = useState("");
  const [myUid, setMyUid] = useState(null);
  // 클로징 저장(1·2차) 성공 시 증가 → PtConfirmBanner가 ot_log를 재조회(같은 회원 stale 방지).
  const [closingVersion, setClosingVersion] = useState(0);

  const loadMembers = useCallback(async () => {
    if (!supabase) {
      setDbNote("데모 모드 — Supabase 키를 설정하면 실데이터가 연결됩니다.");
      setReady(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("user_table")
        .select("*")
        .eq("hidden", false) // 소프트 삭제(환불) 회원 제외
        .order("created_at", { ascending: false });
      if (error) {
        setDbNote("불러오기 실패: " + error.message);
        setReady(true);
        return;
      }
      setMembers((data || []).map(mapMemberRow));
      setDbNote("");
    } catch {
      setDbNote("회원 목록을 불러오지 못했어요 — 잠시 후 새로고침 해주세요.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers(); // 데모 분기가 await 전에 setDbNote를 부른다(구 page.jsx와 동일 패턴).
  }, [loadMembers]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setMyUid(data?.user?.id ?? null));
  }, []);

  // 로컬 status 갱신(낙관적/롤백용).
  const setMemberStatus = useCallback((id, status) => {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
  }, []);

  // 로컬 임의 필드 갱신(낙관적) — 저장 성공 후 반영.
  const onMemberPatch = useCallback((id, patch) => {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const bumpClosingVersion = useCallback(() => setClosingVersion((v) => v + 1), []);

  // 수동 'PT 등록 확정' — 계약(session_log) INSERT + status 전이(둘 다 .select() 하드닝). boolean 반환.
  const confirmPtActive = useCallback(async (member, contractInput) => {
    if (!member?.id) return false;
    if (!supabase) {
      setMemberStatus(member.id, "pt_active"); // 데모: 로컬만
      return true;
    }
    try {
      // 1) 멱등 가드 — 이미 계약 있으면(재시도) INSERT 스킵.
      const { data: existing } = await supabase
        .from("session_log")
        .select("id")
        .eq("user_id", member.id)
        .limit(1);
      const hasContract = (existing?.length ?? 0) > 0;
      // 2) 계약 INSERT (없을 때만) — .select() 하드닝.
      if (!hasContract) {
        const payload = buildContract({ userId: member.id, origin: member.origin, kind: "new", ...contractInput });
        const { data: ins, error: insErr } = await supabase
          .from("session_log")
          .insert(payload)
          .select();
        if (insErr || !ins || ins.length === 0) {
          setDbNote("계약 생성 실패 — session_log INSERT (정책/0행)" + (insErr ? ": " + insErr.message : ""));
          return false; // status 안 건드림(clean)
        }
      }
      // 3) status 전이 — .select() 하드닝. 실패해도 계약은 남을 수 있음 → 재시도 시 (1)이 스킵(멱등).
      const { data, error } = await supabase
        .from("user_table")
        .update(toPtActive(member))
        .eq("id", member.id)
        .select();
      if (error || !data || data.length === 0) {
        setDbNote("PT 등록 확정 실패 — user_table UPDATE (정책/0행)" + (error ? ": " + error.message : ""));
        return false;
      }
      setMemberStatus(member.id, "pt_active"); // 확정 성공 후에만 뷰 전환(깜빡임 방지)
      return true;
    } catch {
      setDbNote("PT 등록 확정 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      return false;
    }
  }, [setMemberStatus]);

  const value = useMemo(() => ({
    members, ready, dbNote, myUid, closingVersion,
    loadMembers, setMemberStatus, onMemberPatch, confirmPtActive, bumpClosingVersion,
  }), [members, ready, dbNote, myUid, closingVersion, loadMembers, setMemberStatus, onMemberPatch, confirmPtActive, bumpClosingVersion]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

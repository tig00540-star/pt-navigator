"use client";

/* 건강정보(불편 부위 · 부상 이력) 입력 칸 앞의 동의 확인(2026-10-05).
   트레이너가 '동의를 받았어요'를 체크해야 칸이 열린다 → 저장할 때 member_consent(trainer_check) 한 줄.
   이미 동의 기록(트레이너 확인 또는 회원 페이지)이 있으면 체크된 채로 시작. 회원이 철회했으면 그렇다고 알려 준다.
   쓰는 곳: MemberForm(새 회원) · MemberEditForm(정보 수정). 문구 출처: lib/consent.js · 종이 동의서 /legal/consent-form. */

import { ShieldCheck } from "lucide-react";

export default function HealthConsentBlock({ checked, onChange, prior, children }) {
  const withdrawn = prior && prior.agreed === false;
  const locked = Boolean(prior?.agreed); // 이미 동의 기록 있음 → 체크 해제로 철회하지 않는다(철회는 회원 본인 · 기록은 덧붙이기만)
  // 회원이 회원 페이지에서 철회했으면 트레이너 체크로 되살리지 않는다(법무 점검 2026-10-05) — 회원이 회원 페이지에서 다시 동의해야 열린다.
  const memberWithdrew = withdrawn && prior.method === "member_page";
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={checked} disabled={locked || memberWithdrew} onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-default" />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[13.5px] font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
            회원에게 건강정보 수집 · 이용 동의를 받았어요
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
            {locked
              ? `동의 기록이 있어요(${prior.method === "member_page" ? "회원이 회원 페이지에서" : "트레이너 확인"}).`
              : memberWithdrew
              ? "회원이 회원 페이지에서 건강정보 동의를 철회했어요. 회원이 회원 페이지에서 다시 동의해야 적을 수 있어요."
              : withdrawn
              ? "건강정보 동의가 철회된 상태예요. 다시 받았을 때만 체크해 주세요."
              : "불편 부위 · 부상 이력은 민감정보라 따로 동의가 필요해요. "}
            {!locked && !memberWithdrew && (
              <a href="/legal/consent-form" target="_blank" rel="noreferrer" className="font-semibold text-sub underline underline-offset-2">종이 동의서 인쇄</a>
            )}
          </span>
        </span>
      </label>
      {checked && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

/** 회원의 가장 최근 건강정보 동의 행(없으면 null). 표 없음(SQL 전) · 실패면 { error }. */
export async function loadHealthConsent(supabase, memberId) {
  if (!supabase || !memberId) return null;
  const { data, error } = await supabase.from("member_consent")
    .select("agreed, method, created_at").eq("member_id", memberId).eq("kind", "health")
    .order("created_at", { ascending: false }).limit(1);
  if (error) { console.error("건강정보 동의 조회 실패", error); return { error }; }
  return data?.[0] || null;
}

/** 트레이너 확인 동의 한 줄 남기기. 성공 true. */
export async function recordHealthConsent(supabase, memberId, version) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return false;
  const { data, error } = await supabase.from("member_consent")
    .insert({ member_id: memberId, kind: "health", agreed: true, method: "trainer_check", version, trainer_id: uid })
    .select("id");
  if (error || !data || data.length === 0) { console.error("건강정보 동의 기록 실패", error); return false; }
  return true;
}

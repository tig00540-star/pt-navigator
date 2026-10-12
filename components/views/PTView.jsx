"use client";

/* =========================================================================
   PT 뷰 — 얇은 셸. 공유 데이터(계약·수업로그) 로드 + 뒤로가기 + PT 서브탭 스위치.
   본체는 서브탭이 소유: 운동일지(PtWorkoutTab) · 재등록(PtReRegTab) · 인바디(PtInbodyTab).
   서브탭은 회원 전환 시 key={member.id}로 리마운트 → 폼 자동 리셋(서브탭에 리셋 effect 없음).
   ========================================================================= */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import PtWorkoutTab from "@/components/views/PtWorkoutTab";
import PtReRegTab from "@/components/views/PtReRegTab";
import PtInbodyTab from "@/components/views/PtInbodyTab";
import RefundMember from "@/components/views/RefundMember";
import MemberPhotoSummary from "@/components/views/MemberPhotoSummary";
import PtDashboard from "@/components/pt/PtDashboard";
import PtTabs from "@/components/pt/PtTabs";
import PtCareTab from "@/components/pt/PtCareTab";

export default function PTView({ member, tab, onGoList, onMemberPatch, onMembersChanged }) {
  const [contracts, setContracts] = useState([]); // session_log (계약)
  const [logs, setLogs] = useState([]); // daily_workout_log (수업로그)
  const [confirms, setConfirms] = useState([]); // workout_log_confirmation (회원 확인/이의 · 트레이너 SELECT 정책 스코프)
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState(false);   // 불러오기 실패(빈 목록과 구분)
  const [reloadKey, setReloadKey] = useState(0);

  // 회원 변경 시 계약·수업로그 로드. setState는 async IIFE 안에서만(set-state-in-effect 회피).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) {
          setContracts([]);
          setLogs([]);
          setConfirms([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const [r1, r2, { data: cf }] = await Promise.all([
          supabase.from("session_log").select("*").eq("user_id", member.id),
          supabase.from("daily_workout_log").select("*").eq("user_id", member.id),
          // 이 회원 일지들의 확인 — 트레이너 SELECT 정책(account 스코프)로 이 회원 것만 온다. 확인 전용(dispute 제거).
          supabase.from("workout_log_confirmation").select("log_id, result, method, content_hash, dispute_note, confirmed_at").eq("member_id", member.id),
        ]);
        const cs = r1.data, ls = r2.data;
        if (cancelled) return;
        if (r1.error || r2.error) {
          // 실패를 빈 목록으로 두면 '진행 중인 계약이 없어요' + 재등록이 신규로 저장된다(2026-10-12 점검) → 다시 읽기 안내.
          console.error("PT 회원 기록 불러오기 실패", r1.error || r2.error);
          setLoadErr(true);
          return;
        }
        setLoadErr(false);
        setContracts(cs || []);
        setLogs(ls || []);
        setConfirms(cf || []);
        setLoading(false);
      } catch {
        if (!cancelled) setLoadErr(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, reloadKey]);

  const isRecord = tab === 12; // 자료남기기 — 환불 여기(맨 끝 · 회원 전용 페이지 링크는 2026-10-11 케어 탭으로)

  if (loadErr) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5 text-center shadow-sm">
        <p className="m-0 text-[14px] text-sub">회원 기록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</p>
        <button type="button" onClick={() => { setLoadErr(false); setReloadKey((k) => k + 1); }}
          className="mt-3 min-h-[40px] rounded-lg border border-line bg-elevate px-4 text-[14px] font-semibold text-ink">다시 불러오기</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 화면 안 탭(OT와 같은 모양) — 대시보드 | 자료남기기 | 케어 | 재등록 */}
      <PtTabs memberId={member.id} tab={tab === 11 || tab === 12 || tab === 13 ? tab : 10} />

      <div key={tab} className="tab-anim">
        {tab === 13 ? (
          <PtCareTab key={member.id} member={member} contracts={contracts} setContracts={setContracts} logs={logs} onMemberPatch={onMemberPatch} />
        ) : tab === 11 ? (
          <PtReRegTab key={member.id} member={member} contracts={contracts} setContracts={setContracts} logs={logs} onMemberPatch={onMemberPatch} />
        ) : tab === 12 ? (
          /* 자료남기기 — 기록 섹션 + (children) 인바디 입력·사진 업로드 */
          <PtWorkoutTab
            key={member.id}
            member={member}
            onMemberPatch={onMemberPatch}
            contracts={contracts}
            setContracts={setContracts}
            logs={logs}
            setLogs={setLogs}
            confirms={confirms}
            loading={loading}
            mode="record"
          >
            <PtInbodyTab member={member} mode="record" />
            <MemberPhotoSummary member={member} mode="form" />
          </PtWorkoutTab>
        ) : (
          /* 회원자료 — 열람 섹션 + (children) 인바디 추이 */
          <PtWorkoutTab
            key={member.id}
            member={member}
            onMemberPatch={onMemberPatch}
            contracts={contracts}
            setContracts={setContracts}
            logs={logs}
            setLogs={setLogs}
            confirms={confirms}
            loading={loading}
            mode="view"
            header={<PtDashboard member={member} contracts={contracts} logs={logs} confirms={confirms} />}
          >
            <PtInbodyTab member={member} mode="view" />
          </PtWorkoutTab>
        )}
      </div>

      {/* 환불 — 자료남기기 탭 맨 끝, 접어 둔다(자주 안 쓰는 것 · 2026-10-02 · 회원 전용 페이지 링크는 2026-10-11 케어 탭으로) */}
      {isRecord && (
        <details className="group/extra">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 rounded-2xl border border-line bg-card px-5 shadow-sm [&::-webkit-details-marker]:hidden">
            <span className="text-[15px] font-bold text-ink">환불</span>
            <span className="truncate text-[13px] text-muted">남은 수업 환불 처리</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform group-open/extra:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-4 space-y-6">
            <RefundMember
              member={member}
              contracts={contracts}
              onDone={() => { onMembersChanged?.(); onGoList?.(); }}
            />
          </div>
        </details>
      )}
    </div>
  );
}

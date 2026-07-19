"use client";

/* =========================================================================
   PT 뷰 — 얇은 셸. 공유 데이터(계약·수업로그) 로드 + 뒤로가기 + PT 서브탭 스위치.
   본체는 서브탭이 소유: 운동일지(PtWorkoutTab) · 재등록(PtReRegTab) · 인바디(PtInbodyTab).
   서브탭은 회원 전환 시 key={member.id}로 리마운트 → 폼 자동 리셋(서브탭에 리셋 effect 없음).
   ========================================================================= */

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import PtWorkoutTab from "@/components/views/PtWorkoutTab";
import PtReRegTab from "@/components/views/PtReRegTab";
import PtInbodyTab from "@/components/views/PtInbodyTab";
import RefundMember from "@/components/views/RefundMember";
import MemberAppLink from "@/components/views/MemberAppLink";
import MemberPhotoSummary from "@/components/views/MemberPhotoSummary";

export default function PTView({ member, tab, onGoList, onMemberPatch, onMembersChanged }) {
  const [contracts, setContracts] = useState([]); // session_log (계약)
  const [logs, setLogs] = useState([]); // daily_workout_log (수업로그)
  const [loading, setLoading] = useState(false);

  // 회원 변경 시 계약·수업로그 로드. setState는 async IIFE 안에서만(set-state-in-effect 회피).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) {
          setContracts([]);
          setLogs([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const [{ data: cs }, { data: ls }] = await Promise.all([
          supabase.from("session_log").select("*").eq("user_id", member.id),
          supabase.from("daily_workout_log").select("*").eq("user_id", member.id),
        ]);
        if (cancelled) return;
        setContracts(cs || []);
        setLogs(ls || []);
        setLoading(false);
      } catch {
        // 조회 실패 — finally에서 로딩 해제.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  const isRecord = tab === 12; // 자료남기기 — 회원앱링크·환불 여기(맨 끝)

  return (
    <div className="space-y-6">
      {onGoList && (
        <button
          onClick={onGoList}
          className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-sub transition hover:text-primary-strong"
        >
          <ChevronLeft className="h-4 w-4" /> 회원 목록
        </button>
      )}

      <div key={tab} className="tab-anim">
        {tab === 11 ? (
          <PtReRegTab key={member.id} member={member} contracts={contracts} setContracts={setContracts} logs={logs} />
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
            loading={loading}
            mode="view"
          >
            <PtInbodyTab member={member} mode="view" />
          </PtWorkoutTab>
        )}
      </div>

      {/* 회원앱 링크 발급 · 환불 — 자료남기기 탭 끝에만 */}
      {isRecord && <MemberAppLink key={member.id} member={member} onMemberPatch={onMemberPatch} />}
      {isRecord && (
        <RefundMember
          member={member}
          contracts={contracts}
          onDone={() => { onMembersChanged?.(); onGoList?.(); }}
        />
      )}
    </div>
  );
}

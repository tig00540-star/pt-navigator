"use client";

/* =========================================================================
   ② '수동 PT 등록 확정' 배너. 게이트: status==='ot_active' 이고
   (round1 or round2 closing_result==='성공'). 성공 기록 ≠ 자동 PT(§1) — 트레이너 수동 확정.
   1차 성공(ObservationTab 저장분)·2차 성공 both 잡는다. update+하드닝은 부모(onConfirm)가 실행.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ContractAmountFields from "@/components/views/ContractAmountFields";

export default function PtConfirmBanner({ member, onConfirm, closingVersion }) {
  const [rounds, setRounds] = useState({ round1: null, round2: null });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false); // 중앙 확인 모달 open (확정 앞단 게이트)
  const [sessions, setSessions] = useState(""); // 계약 세션수(필수)
  const [price, setPrice] = useState(""); // 회당단가(필수·원)
  const [amountEdited, setAmountEdited] = useState(""); // 총액 수동수정("" = 세션×단가 자동)
  const [svc, setSvc] = useState(""); // 서비스 세션(선택·기본 0)
  const [err, setErr] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // 선택 회원의 ot_log 1·2차 closing_result 조회(성공 판정용). demo/미설정 시 스킵.
  useEffect(() => {
    if (!supabase || !member?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRounds({ round1: null, round2: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ot_log")
        .select("ot_round, closing_result")
        .eq("user_id", member.id)
        .in("ot_round", [1, 2]);
      if (cancelled) return;
      const rows = data || [];
      setRounds({
        round1: rows.find((r) => r.ot_round === 1) || null,
        round2: rows.find((r) => r.ot_round === 2) || null,
      });
    })();
    return () => {
      cancelled = true;
    };
    // closingVersion: 클로징 저장(1·2차) 직후 부모가 증가 → 재조회(같은 회원이라 member.id 안 바뀌는 stale 방지).
  }, [member?.id, closingVersion]);

  // 회원 전환 시 금액 입력 초기화 → 이전 회원값 오확정 방지. (closingVersion은 물리지 않음 — 저장 중 리셋 방지)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessions("");
    setPrice("");
    setAmountEdited("");
    setSvc("");
    setErr("");
  }, [member?.id]);

  // ⚠️ 값은 CLOSING_RESULT_OPTS 영문('success') — 저장 경로와 동일(한글 아님).
  const success =
    rounds.round1?.closing_result === "success" || rounds.round2?.closing_result === "success";
  // 게이트: ot_active + 성공(both round). pt_active면 안 뜸(§1 성공≠PT).
  if (member?.status !== "ot_active" || !success) return null;

  // 총액 = 수동수정 있으면 그 값, 없으면 세션수×회당단가 자동.
  const autoAmount = (Number(sessions) || 0) * (Number(price) || 0);

  // 모달 [확정] — 금액 검증 후 부모(onConfirm)가 계약 INSERT + 상태 전이(둘 다 하드닝, boolean 반환).
  const doConfirm = async () => {
    if (!(Number(sessions) > 0 && Number(price) > 0)) {
      setErr("세션수·회당단가를 입력하세요");
      return; // 모달 유지·입력 보존
    }
    setErr("");
    const contractInput = {
      sessions_total: Number(sessions),
      price_per_session: Number(price),
      amount_total: amountEdited === "" ? autoAmount : Number(amountEdited) || autoAmount,
      service_sessions: svc === "" ? 0 : Number(svc) || 0,
    };
    setBusy(true);
    const ok = await onConfirm(contractInput);
    if (!ok) {
      if (mounted.current) {
        setBusy(false);
        setErr("저장 실패 — 다시 시도하세요");
      }
      return; // 모달 유지·입력 보존
    }
    // ok면 부모가 pt_active로 flip → 언마운트(현행). 도달 시엔 busy 정리만.
    if (mounted.current) {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-ink">
        <BadgeCheck className="h-4 w-4 shrink-0 text-primary-strong" />
        <span>
          <b className="text-primary-strong">클로징 성공</b> 기록됨 — 결제 확정되면 PT 등록을 확정하세요.
          <span className="text-muted"> (성공을 기록해도 자동으로 등록되진 않아요)</span>
        </span>
      </div>
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-3.5 py-1.5 text-sm font-bold text-white transition active:scale-95"
      >
        PT 등록 확정
      </button>
      </div>

      {/* 중앙 확인 모달 — 확정 앞단 게이트. 취소·바깥 클릭은 닫힘만(동작 없음), 확정은 명시 버튼으로만. */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 shrink-0 text-primary-strong" />
              <h3 className="text-base font-bold text-ink">PT 등록 확정</h3>
            </div>
            <p className="mb-1 text-sm text-sub">
              <b className="text-primary-strong">{member?.name || "회원"}</b>님을 PT 등록으로 확정할까요?
            </p>
            <p className="mb-4 text-xs text-muted">
              확정하면 PT 회원으로 전환됩니다. 결제가 끝난 뒤 진행하세요.
            </p>

            {/* 계약 금액 — 세션수·회당단가 입력 시 총액 자동(할인이면 총액 수정). */}
            <div className="mb-3">
              <ContractAmountFields
                sessions={sessions} price={price} amountEdited={amountEdited} svc={svc}
                autoAmount={autoAmount} disabled={busy}
                onChange={(k, v) => {
                  if (k === "sessions") setSessions(v);
                  else if (k === "price") setPrice(v);
                  else if (k === "amountEdited") setAmountEdited(v);
                  else if (k === "svc") setSvc(v);
                }}
              />
            </div>

            {err && <p className="mb-3 text-xs font-medium text-red-600">{err}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-line bg-elevate px-4 py-2 text-sm font-medium text-sub transition hover:border-primary active:scale-95 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={doConfirm}
                disabled={busy}
                className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-4 py-2 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                {busy ? "확정 중…" : "확정"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

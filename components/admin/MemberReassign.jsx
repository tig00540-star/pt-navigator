"use client";
/* =========================================================================
   회원 재배정(트레이너 인계) — PT 전용 · admin 운영 탭 모달.
   인계 = ① B 이월계약(handover · 매출0 · trainer_id=B) 생성 → ② A 잔여계약 handed_over=true
          → ③ 담당 user_table.trainer_id=B → ④(옵션) 미완료 예약 trainer_id=B.
   과거 A 수업·매출은 A 원계약(무변)에 보존 · 급여는 계약 trainer_id 기준이라 잔여분만 B로.
   ⚠️ 부분실패 대비 순서·단계별 안내. 완전 멱등화는 후속(재실행 시 B 중복 주의).
   ========================================================================= */
import { useMemo, useState } from "react";
import { X, Search, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor, activeContract, remainingSessions, buildContract } from "@/lib/memberStatus";
import { personName } from "@/lib/format";
import Modal from "@/components/ui/Modal";
import NumberInput from "@/components/ui/NumberInput";
import Button from "@/components/ui/Button";

export default function MemberReassign({ members = [], trainers = [], contracts = [], logs = [], onDone }) {
  const [q, setQ] = useState("");
  const [memberId, setMemberId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [sessions, setSessions] = useState("");
  const [price, setPrice] = useState("");
  const [moveAppts, setMoveAppts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || "미배정";

  // PT 회원만(OT·inactive·hidden 제외).
  const ptMembers = useMemo(() => members.filter((m) => m && !m.hidden && viewFor(m) === "pt"), [members]);
  const filtered = q.trim()
    ? ptMembers.filter((m) => `${m.name} ${m.job || ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : ptMembers;

  const member = ptMembers.find((m) => m.id === memberId) || null;
  const memberContracts = useMemo(() => contracts.filter((c) => c.user_id === memberId), [contracts, memberId]);
  const active = useMemo(() => activeContract(memberContracts, logs), [memberContracts, logs]);
  const rem = active ? remainingSessions(active, logs) : null;

  // 회원 선택 → 활성계약 기준 잔여·단가 프리필.
  const pickMember = (m) => {
    setMemberId(m.id);
    setTrainerId("");
    setErr("");
    const mc = contracts.filter((c) => c.user_id === m.id);
    const act = activeContract(mc, logs);
    const r = act ? remainingSessions(act, logs) : null;
    setSessions(r && r.total > 0 ? String(r.total) : "");
    setPrice(act?.price_per_session ? String(act.price_per_session) : "");
  };

  const reassign = async () => {
    if (saving) return;
    if (!member) { setErr("회원을 선택하세요"); return; }
    if (!trainerId) { setErr("새 담당 트레이너를 선택하세요"); return; }
    if (trainerId === member.trainer_id) { setErr("현재 담당과 다른 트레이너를 선택하세요"); return; }
    if (!supabase) { setErr("Supabase가 설정되지 않았어요"); return; }
    const n = Number(sessions) || 0;
    const p = Number(price) || 0;
    if (n > 0 && !(p > 0)) { setErr("이월할 잔여가 있으면 회당단가가 필요합니다"); return; }

    setSaving(true); setErr("");
    try {
      // ① B 이월계약(잔여 있을 때만) — buildContract가 counts_as_revenue=false, trainer_id는 바깥에서.
      if (n > 0) {
        const payload = {
          ...buildContract({ userId: member.id, origin: "handover", sessions_total: n, price_per_session: p, amount_total: null, service_sessions: 0 }),
          trainer_id: trainerId,
        };
        const { data, error } = await supabase.from("session_log").insert(payload).select();
        if (error || !data || data.length === 0) { setErr("① 이월계약 생성 실패 — 다시 시도하세요(아직 아무것도 안 바뀜)."); setSaving(false); return; }
        // ② A 잔여>0 계약 전부 닫기(보통 1건).
        const toClose = memberContracts.filter((c) => remainingSessions(c, logs).total > 0);
        for (const c of toClose) {
          const { data: u, error: e2 } = await supabase.from("session_log").update({ handed_over: true }).eq("id", c.id).select();
          if (e2 || !u || u.length === 0) { setErr("② 기존 계약 닫기 실패 — 이월계약은 생성됨. 재실행 말고 잔여를 확인 후 마무리하세요."); setSaving(false); return; }
        }
      }
      // ③ 담당 이전.
      const { data: um, error: e3 } = await supabase.from("user_table").update({ trainer_id: trainerId }).eq("id", member.id).select();
      if (e3 || !um || um.length === 0) { setErr("③ 담당 이전 실패 — 계약은 이전됨. 이 회원 담당만 다시 지정하세요."); setSaving(false); return; }
      // ④ (옵션) 미완료 예약 이전 — 0행은 정상(예약 없음)이라 error만 체크.
      if (moveAppts) {
        const { error: e4 } = await supabase.from("appointment").update({ trainer_id: trainerId }).eq("user_id", member.id).eq("status", "booked").select();
        if (e4) { setErr("④ 예약 이전 실패(담당·계약은 이전됨) — 예약은 스케줄에서 수동 이전하세요."); setSaving(false); return; }
      }
      setSaving(false);
    } catch {
      setErr("인계 중 오류 — 상태를 확인하고 남은 단계만 마무리하세요.");
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }
    onDone();
  };

  const trainerOpts = trainers.filter((t) => !member || t.id !== member.trainer_id);

  return (
    <Modal variant="center" onClose={onDone}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-primary-strong" />
          <h2 className="text-base font-semibold text-ink">회원 재배정 (트레이너 인계)</h2>
        </div>
        <button onClick={onDone} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-elevate hover:text-ink" aria-label="닫기">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 회원 선택 (PT만) */}
      {!member ? (
        <div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PT 회원 검색 (이름·직업)"
              className="w-full rounded-lg border border-line bg-elevate py-2 pl-8 pr-3 text-sm text-ink placeholder-muted outline-none focus:border-primary" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">재배정할 PT 회원이 없습니다.</p>
            ) : filtered.map((m) => (
              <button key={m.id} onClick={() => pickMember(m)} className="flex w-full items-center gap-2 rounded-lg border border-line bg-elevate px-3 py-2 text-left transition hover:border-primary">
                <span className="text-sm font-medium text-ink">{m.name}</span>
                <span className="text-xs text-muted">{m.job}</span>
                <span className="ml-auto text-[11px] text-muted">담당 {nameOf(m.trainer_id)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 선택 회원 요약 */}
          <div className="flex items-center justify-between rounded-lg border border-line bg-elevate px-3 py-2">
            <div>
              <span className="text-sm font-semibold text-ink">{member.name}</span>
              <span className="ml-2 text-[11px] text-muted">현 담당 {nameOf(member.trainer_id)}</span>
            </div>
            <button onClick={() => { setMemberId(""); setErr(""); }} className="text-[11px] font-medium text-primary-strong hover:underline">회원 변경</button>
          </div>

          {rem && rem.total > 0 ? (
            <p className="text-[12px] text-sub">이월할 잔여: <b className="text-ink">{rem.total}회</b>{active?.price_per_session ? ` · 현 회당 ${active.price_per_session.toLocaleString("ko-KR")}원` : ""}</p>
          ) : (
            <p className="text-[12px] text-muted">이월할 잔여가 없어요 — 담당만 이전됩니다.</p>
          )}

          {/* 새 담당 */}
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">새 담당 트레이너 *</span>
            <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)}
              className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary">
              <option value="">선택하세요</option>
              {trainerOpts.map((t) => <option key={t.id} value={t.id}>{personName(t.name)}</option>)}
            </select>
          </label>

          {/* 이월 잔여·단가(잔여 있을 때만) */}
          {rem && rem.total > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">이월 잔여 세션</span>
                <NumberInput value={sessions} onValueChange={setSessions} placeholder="20"
                  className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">회당단가(원)</span>
                <NumberInput value={price} onValueChange={setPrice} placeholder="50000"
                  className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary" />
              </label>
            </div>
          )}

          {/* 미완료 예약 이전 */}
          <label className="flex items-center gap-2 text-[12px] text-sub">
            <input type="checkbox" checked={moveAppts} onChange={(e) => setMoveAppts(e.target.checked)} className="h-4 w-4 rounded border-line" />
            미완료 예약도 새 담당에게 이전
          </label>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{err}</div>}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="md" onClick={onDone} className="flex-1">취소</Button>
            <Button variant="primary" size="md" onClick={reassign} disabled={saving} className="flex-1">
              {saving ? "인계 중…" : "인계하기"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

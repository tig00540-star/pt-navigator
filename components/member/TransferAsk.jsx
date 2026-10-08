"use client";

/* 회원 전용 페이지 '기록을 함께 옮길까요?'(2026-10-07 · 계획서 2단계)
   트레이너가 센터로 합류하면(또는 센터에서 독립하면) 기록을 관리하는 곳(운영자)이 바뀌어서 회원 동의를 받는다.
   rpc my_member_transfer() 가 있으면 페이지를 열 때 창이 뜬다(닫을 수 있음 · 다음에 열면 다시) →
   [함께 옮겨 주세요] = answer_member_transfer(true)(기록 전부가 새 곳으로 · 링크 그대로) · [옮기지 않을래요] = false.
   14일 안에 답이 없으면 옮기지 않는다(기본값 = 안전 · 그 기록은 옛 계정과 함께 30일 뒤 지워짐). */

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

// '센터로' / '강남점으로' — 받침 있으면(ㄹ 빼고) '으로'
const ro = (w) => { const c = String(w || "").trim().slice(-1).charCodeAt(0) - 0xac00; const jong = c >= 0 && c < 11172 ? c % 28 : 0; return `${w}${jong && jong !== 8 ? "으로" : "로"}`; };
const dateKo = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

export default function TransferAsk({ supabase, onMoved }) {
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("my_member_transfer");
      if (!alive) return;
      if (error) { console.error("이동 요청 확인 실패", error); return; }   // 함수가 아직 없으면(SQL 전) 조용히
      if (data && data.id) { setT(data); setOpen(true); }
    })();
    return () => { alive = false; };
  }, [supabase]);

  if (!t) return null;

  const answer = async (agree) => {
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("answer_member_transfer", { p_agree: agree });
    setBusy(false);
    if (error || !data?.ok) { console.error("이동 답하기 실패", error || data); setMsg("저장하지 못했어요. 다시 시도해 주세요."); return; }
    setOpen(false); setT(null);
    if (agree) onMoved?.();
  };

  const who = t.trainer_name ? `${t.trainer_name} 트레이너` : "담당 트레이너";
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="mb-4 flex min-h-[48px] w-full flex-col items-start gap-0.5 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-left text-[14px] font-bold text-primary-strong">
          기록을 {ro(t.to_name)} 함께 옮길지 골라 주세요
          <span className="text-[13px] font-semibold text-sub">{dateKo(t.deadline)}까지 · 눌러서 고르기</span>
        </button>
      )}
      {open && (
        <Modal title="기록을 함께 옮길까요?" onClose={() => setOpen(false)}
          footer={(
            <div className="flex w-full flex-col gap-2">
              <Button variant="primary" size="md" fullWidth onClick={() => answer(true)} disabled={busy}>{busy ? "처리하는 중…" : "함께 옮겨 주세요"}</Button>
              <Button variant="ghost" size="md" fullWidth onClick={() => answer(false)} disabled={busy}>옮기지 않을래요</Button>
            </div>
          )}>
          <p className="m-0 text-[15px] leading-relaxed text-ink">
            {who}가 <b>{ro(t.to_name)}</b> 옮겨요. 앞으로 {t.to_name}에서 회원님 기록을 관리해요.
          </p>
          <ul className="m-0 mt-3 list-none space-y-1.5 p-0 text-[14px] leading-relaxed text-sub">
            <li>· 운동일지 · 인바디 · 사진 · 수업 기록과 남은 수업을 그대로 옮겨요.</li>
            <li>· 이 링크는 그대로 쓸 수 있어요.</li>
            {t.kind === "import"
              ? <li>· 옮기지 않으면 지금처럼 {who} 개인 기록으로 남아요. {dateKo(t.deadline)}까지 답이 없으면 옮기지 않아요.</li>
              : <li>· {dateKo(t.deadline)}까지 답이 없으면 옮기지 않아요. 옮기지 않은 기록은 30일 뒤 지워져요.</li>}
          </ul>
          {msg && <p className="m-0 mt-3 text-[13.5px] font-semibold text-danger-text">{msg}</p>}
        </Modal>
      )}
    </>
  );
}

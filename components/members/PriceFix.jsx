"use client";

/* 계약 회당 단가 바로 넣기(2026-10-12 · 회원 한꺼번에 등록 때 비워 둔 단가) — 기본정보 마무리 카드 · PT 대시보드 '지금 할 일'.
   계약(session_log) 한 줄의 price_per_session만 고친다(.select() 하드닝 · 대표 · 담당 트레이너만 = 보안 규칙). */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import NumberInput from "@/components/ui/NumberInput";
import Button from "@/components/ui/Button";

export default function PriceFix({ contractId, onSaved, compact = false }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const n = Number(v);
    if (!(n > 0 && n <= 10000000)) { setErr("회당 단가를 입력해 주세요"); return; }
    if (!supabase || !contractId) return;
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.from("session_log").update({ price_per_session: n }).eq("id", contractId).select("id");
      if (error || !data?.length) {
        if (error) console.error("회당 단가 저장 실패", error);
        setErr(error ? "저장하지 못했어요. 다시 시도해 주세요." : "저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
        return;
      }
      onSaved?.(n);
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className={compact ? "w-[150px]" : "min-w-0 flex-1"}>
          <NumberInput size="sm" value={v} onValueChange={setV} placeholder="회당 단가" suffix="원" aria-label="회당 단가"
            onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        </div>
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>
      </div>
      {err && <p className="m-0 mt-1 text-[12px] text-danger-text">{err}</p>}
    </div>
  );
}

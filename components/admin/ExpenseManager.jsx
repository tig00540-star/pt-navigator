"use client";

/* =========================================================================
   ExpenseManager — 인앱 지출 장부 (Phase B · 노션 대체 · 운영 탭)
   -------------------------------------------------------------------------
   Supabase `expense` 테이블(계정별·RLS)에 지출 입력/조회/삭제. 대시보드 순이익의 지출원.
   ⚠️ 교훈1 하드닝: 모든 write에 .select() → error||!data||len0 이면 실패 처리.
   account_id는 테이블 default auth_account_id() + RLS with check가 자동/검증.
   ========================================================================= */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { EXPENSE_CATEGORIES, expenseInMonth, expensesByCategory } from "@/lib/expenses";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

const WON = (n) => Math.round(n || 0).toLocaleString("ko-KR") + "원";
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export default function ExpenseManager({ expenses = [], ym, onChanged }) {
  const [spentOn, setSpentOn] = useState(todayKST());
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const total = expenseInMonth(expenses, ym);
  const byCat = expensesByCategory(expenses, ym);
  const monthRows = [...expenses]
    .filter((e) => typeof e?.spent_on === "string" && e.spent_on.slice(0, 7) === ym)
    .sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));

  const add = async () => {
    setErr("");
    const amt = Math.round(Number(String(amount).replace(/[^0-9.-]/g, "")));
    if (!spentOn) { setErr("일자를 선택하세요."); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setErr("금액을 올바르게 입력하세요."); return; }
    if (!supabase) { setErr("데모 모드 — 저장하려면 Supabase 키가 필요합니다."); return; }
    setBusy(true);
    const { data, error } = await supabase.from("expense")
      .insert({ spent_on: spentOn, category, amount: amt, memo: memo.trim() || null })
      .select();
    setBusy(false);
    if (error || !data || data.length === 0) {
      setErr("저장 실패 — 지출 테이블 마이그레이션이 실행됐는지 확인하세요. " + (error?.message || ""));
      return;
    }
    setAmount(""); setMemo("");
    onChanged?.();
  };

  const del = async (id) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("expense").delete().eq("id", id).select();
    if (error || !data || data.length === 0) { setErr("삭제 실패 — 다시 시도하세요."); return; }
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[13px] text-muted">이번달 지출</span>
        <span className="font-mono text-[22px] font-bold text-ink">{WON(total)}</span>
      </div>
      {byCat.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {byCat.map((c) => (
            <span key={c.category} className="rounded-full border border-line bg-elevate px-2.5 py-1 text-[11px] text-sub">
              {c.category} <b className="font-mono text-ink">{WON(c.amount)}</b>
            </span>
          ))}
        </div>
      )}

      {/* 입력 폼 */}
      <Card padding="sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputCls} aria-label="지출 일자" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} aria-label="분류">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input inputMode="numeric" placeholder="금액(원)" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} aria-label="금액" />
          <input type="text" placeholder="메모(선택)" value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} aria-label="메모" />
        </div>
        {err && <div className="mt-2 text-[12px] text-danger-text">{err}</div>}
        <div className="mt-2.5">
          <Button variant="primary" size="sm" onClick={add} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> {busy ? "저장 중…" : "지출 추가"}
          </Button>
        </div>
      </Card>

      {/* 이번달 목록 */}
      {monthRows.length === 0 ? (
        <p className="rounded-xl border border-line bg-elevate px-4 py-3 text-[12px] text-muted">이번달 지출 내역이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {monthRows.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="font-mono text-[12px] text-muted">{e.spent_on?.slice(5)}</span>
              <span className="shrink-0 rounded-full bg-elevate px-2 py-0.5 text-[11px] text-sub">{e.category || "기타"}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{e.memo || ""}</span>
              <span className="font-mono text-[13px] font-semibold text-ink">{WON(e.amount)}</span>
              <button type="button" onClick={() => del(e.id)} className="text-muted transition-colors hover:text-danger-text" aria-label="삭제">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

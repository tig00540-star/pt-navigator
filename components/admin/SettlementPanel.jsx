"use client";

/* =========================================================================
   SettlementPanel — 기간 정산(총매출·지출·순이익) + FC/기타 매출 수기 입력.

   ── 왜 기간을 고르게 하나 ──
   센터마다 정산 주기가 다르다. 1일~말일도 있고 15일~익월 14일도 있다.
   달력월로만 보여주면 그 센터 장부와 숫자가 안 맞아 결국 엑셀을 다시 켠다.

   ── ⚠️ 이 화면의 FC·기타 매출은 트레이너 지표에 절대 안 들어간다 ──
   트레이너 실적·급여·전환율은 PT 계약(session_log)만 본다.
   FC매출은 센터 FC부서가 파는 회원권이라 담당 트레이너가 없다. 합치면 급여가 틀어진다.

   교훈1 하드닝: insert/delete에 .select() → 0행이면 실패 처리(RLS 차단은 error가 아니라 0행).
   ========================================================================= */

import { useMemo, useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import { kstToday } from "@/lib/date";
import { INCOME_KINDS, incomeKindLabel, settlementRange, settlementTotals } from "@/lib/income";
import { revenueCompositionInRange } from "@/lib/memberStatus";

const WON = (n) => Math.round(n || 0).toLocaleString("ko-KR") + "원";

export default function SettlementPanel({
  contracts = [], incomes = [], expenses = [], ym,
  startDay = 1, onChangeStartDay, onChanged,
}) {
  const base = settlementRange(ym, startDay);
  // 기본은 계정 정산 주기, 필요하면 그 자리에서 날짜를 직접 바꾼다.
  const [from, setFrom] = useState(base.from);
  const [to, setTo] = useState(base.to);

  const [earnedOn, setEarnedOn] = useState(kstToday());
  const [kind, setKind] = useState("fc");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  const pt = useMemo(() => revenueCompositionInRange(contracts, from, to), [contracts, from, to]);
  const t = useMemo(
    () => settlementTotals({ ptRevenue: pt.net, incomes, expenses, from, to }),
    [pt.net, incomes, expenses, from, to]
  );
  const rows = useMemo(
    () => incomes
      .filter((r) => typeof r?.earned_on === "string" && r.earned_on >= from && r.earned_on <= to)
      .sort((a, b) => (a.earned_on < b.earned_on ? 1 : -1)),
    [incomes, from, to]
  );

  const save = async () => {
    const amt = Number(String(amount).replace(/[^0-9]/g, ""));
    if (!earnedOn || !amt) { setNote("날짜와 금액을 입력하세요."); return; }
    if (!supabase) { setNote("데모 모드 — 저장하려면 Supabase 키가 필요합니다."); return; }
    setSaving(true); setNote("");
    try {
      const { data, error } = await supabase
        .from("income")
        .insert({ earned_on: earnedOn, kind, amount: amt, memo: memo.trim() || null })
        .select();
      if (error || !data || data.length === 0) {
        setNote("저장 실패 — 마이그레이션(2026-09-29-income.sql)이 실행됐는지 확인하세요." + (error ? ` (${error.message})` : ""));
        return;
      }
      setAmount(""); setMemo("");
      onChanged?.();
    } catch (e) {
      setNote("저장 중 오류: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("income").delete().eq("id", id).select();
    if (error || !data || data.length === 0) { setNote("삭제 실패 — 권한/정책을 확인하세요."); return; }
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      {/* ── 기간 정산 ── */}
      <Card as="section">
        <Eyebrow icon={Wallet}>기간 정산</Eyebrow>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          PT 매출은 앱이 계산하고, FC·기타 매출은 아래에서 직접 적습니다. 순이익은 셋을 더한 뒤 지출을 뺀 값입니다.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">시작일</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">종료일</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={() => { setFrom(base.from); setTo(base.to); }}
            className="min-h-[42px] rounded-lg border border-line bg-elevate px-3 text-[12px] font-semibold text-sub transition hover:text-ink"
          >
            이번 정산 기간
          </button>
        </div>

        <div className="mt-4 divide-y divide-line rounded-xl border border-line">
          <Row label="PT 매출" value={pt.net} sub={`신규 ${pt.cntNew}건 · 재등록 ${pt.cntRe}건${pt.refund ? ` · 환불 ${WON(pt.refund)} 차감` : ""}`} />
          <Row label="FC 매출" value={t.fc} sub="회원권 등 센터 FC부서" />
          <Row label="기타 매출" value={t.etc} />
          <Row label="총 매출" value={t.revenue} strong />
          <Row label="지출" value={-t.expense} sub="아래 지출 관리에서 입력" />
          <Row label="순이익" value={t.net} strong accent />
        </div>

        {/* 정산 시작일 — 센터 주기(1일 / 15일 등) */}
        {onChangeStartDay && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
            <span>정산 시작일</span>
            <select
              value={startDay}
              onChange={(e) => onChangeStartDay(Number(e.target.value))}
              className="rounded-lg border border-line bg-elevate px-2 py-1.5 text-[12px] text-ink"
              aria-label="정산 시작일"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}일</option>
              ))}
            </select>
            <span>{startDay === 1 ? "달력 월 그대로" : `${startDay}일 ~ 익월 ${startDay - 1}일`}</span>
          </div>
        )}
      </Card>

      {/* ── FC·기타 매출 입력 ── */}
      <Card as="section">
        <Eyebrow icon={Plus}>FC · 기타 매출 입력</Eyebrow>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          회원권 상세(기간·락커·운동복)는 메모에 자유롭게 적으세요. 예: &quot;김OO 3개월 + 락커&quot;
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_auto_1fr_2fr_auto]">
          <input type="date" value={earnedOn} onChange={(e) => setEarnedOn(e.target.value)} className={inputCls} aria-label="날짜" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls} aria-label="종류">
            {INCOME_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <input
            type="text" inputMode="numeric" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="금액" className={inputCls} aria-label="금액"
          />
          <input
            type="text" value={memo} onChange={(e) => setMemo(e.target.value)}
            placeholder="메모(선택)" className={inputCls} aria-label="메모"
          />
          <Button variant="primary" size="md" onClick={save} disabled={saving}>
            {saving ? "저장 중…" : "추가"}
          </Button>
        </div>

        {note && <p className="mt-2 text-[12px] text-danger-text">{note}</p>}

        <div className="mt-4 space-y-1.5">
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-elevate px-4 py-6 text-center text-[12px] text-muted">
              이 기간에 적힌 FC·기타 매출이 없습니다.
            </p>
          ) : rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
              <span className="font-mono text-[12px] text-muted">{r.earned_on?.slice(5)}</span>
              <span className="shrink-0 rounded-full bg-elevate px-2 py-0.5 text-[11px] text-sub">{incomeKindLabel(r.kind)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{r.memo || ""}</span>
              <span className="font-mono text-[13px] font-bold text-ink">{WON(r.amount)}</span>
              <button onClick={() => remove(r.id)} aria-label="삭제" className="rounded-lg p-1 text-muted transition hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, sub, strong, accent }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className={`block text-[13px] ${strong ? "font-extrabold text-ink" : "font-semibold text-sub"}`}>{label}</span>
        {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 font-mono tabular-nums ${
        accent ? "text-[17px] font-extrabold text-primary-strong" : strong ? "text-[15px] font-extrabold text-ink" : "text-[14px] text-sub"
      }`}>
        {WON(value)}
      </span>
    </div>
  );
}

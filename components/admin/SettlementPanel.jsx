"use client";

/* =========================================================================
   SettlementPanel — 정산 탭. [정산 보기] · [장부 적기] 두 화면.

   ── 왜 둘로 나누나 ──
   성격이 다른 일이다. 적는 건 자주·짧게·여러 번(영수증 생길 때마다 30초),
   보는 건 월말에 한 번·길게. 한 화면에 같이 두면 숫자 보러 들어왔는데
   입력 폼이 먼저 눈에 들어온다.

   ── 왜 입력 폼은 하나인가 ──
   FC매출·기타매출·지출은 칸 구성이 똑같다(날짜·금액·메모). 구분만 고르게 하면
   폼 하나로 끝난다. 화면을 쪼개면 오늘 회원권 팔고 비품도 산 사람이 두 군데를 오가야 한다.
   ('매출/지출/정산' 3분할을 안 쓴 이유 — 상단에 이미 분석용 '매출' 탭이 있어
    같은 이름이 다른 걸 가리키게 되는 문제도 있다.)

   ── ⚠️ 이 화면의 FC·기타 매출은 트레이너 지표에 절대 안 들어간다 ──
   트레이너 실적·급여·전환율은 PT 계약(session_log)만 본다.
   FC매출은 센터 FC부서가 파는 회원권이라 담당 트레이너가 없다. 합치면 급여가 틀어진다.

   교훈1 하드닝: insert/delete에 .select() → 0행이면 실패 처리(RLS 차단은 error가 아니라 0행).
   ========================================================================= */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import { kstToday } from "@/lib/date";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { incomeKindLabel, settlementRange, settlementTotals } from "@/lib/income";
import { revenueCompositionInRange } from "@/lib/memberStatus";

const WON = (n) => Math.round(n || 0).toLocaleString("ko-KR") + "원";

// 장부에 적는 것 3종 — 칸 구성이 같아서 폼 하나로 받는다. 지출만 분류를 더 고른다.
const ENTRY_KINDS = [
  { key: "fc", label: "FC매출", table: "income" },
  { key: "etc", label: "기타매출", table: "income" },
  { key: "expense", label: "지출", table: "expense" },
];

/** 'YYYY-MM-DD' → '9월 1일' */
const dayLabel = (ymd) =>
  typeof ymd === "string" && ymd.length >= 10
    ? `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
    : "—";

/** 'YYYY-MM' ± n개월 */
function shiftYm(ym, delta) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SettlementPanel({
  contracts = [], incomes = [], expenses = [], ym, view = "view",
  startDay = 1, onChangeStartDay, onIncomeChanged, onExpenseChanged,
}) {
  // view(보기/적기)는 상단 세그먼트가 준다 — 하위탭이 화면마다 다른 자리에 있으면 안 된다.
  const [ymBase, setYmBase] = useState(ym);     // 보는 정산 기간의 기준월
  const [custom, setCustom] = useState(false);  // 직접 고르기(예외 상황)
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");

  // 기간은 상태가 아니라 파생 — 정산 시작일이 늦게 도착해도 자동으로 맞는다.
  const period = useMemo(() => settlementRange(ymBase, startDay), [ymBase, startDay]);
  const from = custom && cFrom ? cFrom : period.from;
  const to = custom && cTo ? cTo : period.to;

  const pt = useMemo(() => revenueCompositionInRange(contracts, from, to), [contracts, from, to]);
  const t = useMemo(
    () => settlementTotals({ ptRevenue: pt.net, incomes, expenses, from, to }),
    [pt.net, incomes, expenses, from, to]
  );

  // 기간 안 지출 분류별 — 어디에 많이 나갔는지 한 줄로.
  const byCat = useMemo(() => {
    const m = new Map();
    for (const e of expenses) {
      if (!e || typeof e.spent_on !== "string") continue;
      const d = e.spent_on.slice(0, 10);
      if (d < from || d > to) continue;
      const c = e.category || "기타";
      m.set(c, (m.get(c) || 0) + (e.amount || 0));
    }
    return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses, from, to]);

  // 기간 안 장부 내역 — 수입·지출 한 목록(시간순). 오늘 뭘 적었는지 여기서 본다.
  const ledger = useMemo(() => {
    const rows = [];
    for (const r of incomes) {
      if (!r || typeof r.earned_on !== "string") continue;
      const d = r.earned_on.slice(0, 10);
      if (d < from || d > to) continue;
      rows.push({ id: "i" + r.id, rowId: r.id, table: "income", date: d, label: incomeKindLabel(r.kind), amount: r.amount || 0, memo: r.memo, income: true });
    }
    for (const e of expenses) {
      if (!e || typeof e.spent_on !== "string") continue;
      const d = e.spent_on.slice(0, 10);
      if (d < from || d > to) continue;
      rows.push({ id: "e" + e.id, rowId: e.id, table: "expense", date: d, label: e.category || "기타", amount: e.amount || 0, memo: e.memo, income: false });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [incomes, expenses, from, to]);

  return (
    <div className="space-y-4">
      {view === "view" ? (
        <ViewPane
          from={from} to={to} custom={custom} setCustom={setCustom}
          cFrom={cFrom} setCFrom={setCFrom} cTo={cTo} setCTo={setCTo}
          ymBase={ymBase} setYmBase={setYmBase} ym={ym}
          pt={pt} t={t} byCat={byCat}
          startDay={startDay} onChangeStartDay={onChangeStartDay}
        />
      ) : (
        <EntryPane
          from={from} to={to} ledger={ledger}
          onIncomeChanged={onIncomeChanged} onExpenseChanged={onExpenseChanged}
        />
      )}
    </div>
  );
}

/* ── 정산 보기 ───────────────────────────────────────────────────────────── */
function ViewPane({
  from, to, custom, setCustom, cFrom, setCFrom, cTo, setCTo,
  ymBase, setYmBase, ym, pt, t, byCat, startDay, onChangeStartDay,
}) {
  const atLatest = ymBase >= ym; // 다음 기간은 아직 안 온 달 — 빈 화면만 보게 된다
  const openCustom = () => { setCFrom(from); setCTo(to); setCustom(true); };

  return (
    <>
      <Card as="section">
        <Eyebrow icon={Wallet}>정산</Eyebrow>

        {/* 기간 — 기본은 앞뒤로 넘기기. 날짜를 직접 채우는 건 예외라 접어둔다. */}
        {!custom ? (
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={() => setYmBase(shiftYm(ymBase, -1))} aria-label="이전 기간"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-elevate text-sub transition hover:text-ink">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">
                {dayLabel(from)} ~ {dayLabel(to)}
              </div>
            </div>
            <button type="button" onClick={() => !atLatest && setYmBase(shiftYm(ymBase, 1))} aria-label="다음 기간" disabled={atLatest}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-elevate transition ${
                atLatest ? "text-line" : "text-sub hover:text-ink"
              }`}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">시작일</span>
              <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">종료일</span>
              <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className={inputCls} />
            </label>
          </div>
        )}
        <div className="mt-1.5 text-center">
          <button type="button" onClick={() => (custom ? setCustom(false) : openCustom())}
            className="text-[11px] font-semibold text-muted underline underline-offset-2">
            {custom ? "정산 기간으로 돌아가기" : "직접 고르기"}
          </button>
        </div>

        <div className="mt-4 divide-y divide-line rounded-xl border border-line">
          <Row label="PT 매출" value={pt.net} sub={`신규 ${pt.cntNew}건 · 재등록 ${pt.cntRe}건${pt.refund ? ` · 환불 ${WON(pt.refund)} 차감` : ""}`} />
          <Row label="FC 매출" value={t.fc} sub="회원권 등 센터 FC부서" />
          <Row label="기타 매출" value={t.etc} />
          <Row label="총 매출" value={t.revenue} strong />
          <Row label="지출" value={-t.expense} />
          <Row label="순이익" value={t.net} strong accent />
        </div>

        {byCat.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {byCat.map((c) => (
              <span key={c.category} className="rounded-full border border-line bg-elevate px-2.5 py-1 text-[11px] text-sub">
                {c.category} <b className="font-mono text-ink">{WON(c.amount)}</b>
              </span>
            ))}
          </div>
        )}

        {/* 정산 기간 설정 — 매달의 기본값이다. '직접 고르기'는 지금 한 번 보는 것이고,
            이건 화살표로 넘길 때의 기준(15일 마감 센터는 이걸 안 하면 매달 날짜를 다시 찍는다). */}
        {onChangeStartDay && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-sub">
            <span className="font-semibold">정산 기준일 설정</span>
            <select
              value={startDay}
              onChange={(e) => onChangeStartDay(Number(e.target.value))}
              className="rounded-lg border border-line bg-elevate px-2 py-1.5 text-[12px] text-ink"
              aria-label="정산 시작일"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}일 시작</option>
              ))}
            </select>
            <span className="text-muted">
              {startDay === 1 ? "매달 1일부터 말일까지" : `매달 ${startDay}일부터 다음달 ${startDay - 1}일까지`}
            </span>
            </div>
            {custom && <p className="mt-1 text-[11px] text-muted">지금은 직접 고른 기간을 보고 있어요 — 이 설정은 매달의 기본 기간입니다.</p>}
          </div>
        )}
      </Card>
    </>
  );
}

/* ── 장부 적기 ───────────────────────────────────────────────────────────── */
function EntryPane({ from, to, ledger, onIncomeChanged, onExpenseChanged }) {
  const [date, setDate] = useState(kstToday());
  const [kind, setKind] = useState("fc");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  const isExpense = kind === "expense";

  const save = async () => {
    const amt = Math.round(Number(String(amount).replace(/[^0-9]/g, "")));
    if (!date || !Number.isFinite(amt) || amt <= 0) { setNote("날짜와 금액을 입력하세요."); return; }
    if (!supabase) { setNote("데모 모드 — 저장하려면 Supabase 키가 필요합니다."); return; }
    setSaving(true); setNote("");
    try {
      const payload = isExpense
        ? { table: "expense", row: { spent_on: date, category, amount: amt, memo: memo.trim() || null } }
        : { table: "income", row: { earned_on: date, kind, amount: amt, memo: memo.trim() || null } };
      const { data, error } = await supabase.from(payload.table).insert(payload.row).select();
      if (error || !data || data.length === 0) {
        setNote("저장 실패 — 마이그레이션이 실행됐는지 확인하세요." + (error ? ` (${error.message})` : ""));
        return;
      }
      setAmount(""); setMemo("");
      (isExpense ? onExpenseChanged : onIncomeChanged)?.();
    } catch (e) {
      setNote("저장 중 오류: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!supabase) return;
    const { data, error } = await supabase.from(row.table).delete().eq("id", row.rowId).select();
    if (error || !data || data.length === 0) { setNote("삭제 실패 — 권한/정책을 확인하세요."); return; }
    (row.table === "expense" ? onExpenseChanged : onIncomeChanged)?.();
  };

  return (
    <>
      <Card as="section">
        <Eyebrow icon={Plus}>장부 적기</Eyebrow>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          회원권 상세(기간·락커·운동복)는 메모에 자유롭게 적으세요. 예: &quot;김OO 3개월 + 락커&quot;
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="날짜" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls} aria-label="구분">
            {ENTRY_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          {isExpense && (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} aria-label="지출 분류">
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="금액" className={inputCls} aria-label="금액" />
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)}
            placeholder="메모(선택)" className={`${inputCls} col-span-2`} aria-label="메모" />
        </div>

        {note && <p className="mt-2 text-[12px] text-danger-text">{note}</p>}

        <div className="mt-2.5">
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            <Plus className="h-3.5 w-3.5" /> {saving ? "저장 중…" : "추가"}
          </Button>
        </div>
      </Card>

      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-ink">이 기간 내역</span>
          <span className="text-[11px] text-muted">{dayLabel(from)} ~ {dayLabel(to)}</span>
        </div>

        {ledger.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line bg-elevate px-4 py-6 text-center text-[12px] text-muted">
            이 기간에 적은 내역이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {ledger.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                <span className="font-mono text-[12px] text-muted">{r.date.slice(5)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${r.income ? "bg-primary-soft text-primary-strong" : "bg-elevate text-sub"}`}>
                  {r.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-sub">{r.memo || ""}</span>
                <span className={`shrink-0 font-mono text-[13px] font-bold ${r.income ? "text-ink" : "text-danger-text"}`}>
                  {r.income ? "" : "−"}{WON(r.amount)}
                </span>
                <button type="button" onClick={() => remove(r)} aria-label="삭제"
                  className="shrink-0 rounded-lg p-1 text-muted transition hover:text-danger-text">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
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

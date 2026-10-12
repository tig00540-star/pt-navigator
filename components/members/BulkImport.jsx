"use client";

/* 회원 한꺼번에 등록(2026-10-12 · docs/v2-계획-처음시작-회원일괄등록.md) — /members/import
   ① 입력(바로 쓰기 | 붙여 넣기) → ② 확인(줄마다 ✓ · ⚠ · 건너뜀) → ③ 완료(스케줄 잡기 · 기본정보 마무리 · 10분 되돌리기).
   저장 = DB 함수 bulk_add_members 한 번(다 되거나 하나도 안 되거나 · 보안 규칙 그대로).
   되돌리기 = undo_bulk_members(방금 만든 회원 중 고른 것 · 그 사이 기록이 생긴 회원은 남김).
   PT · '이번 달 등록' = 매출 계약(등록일 · 결제 금액) / 그 밖 = 이월 계약(매출 제외 · 단가 빈칸 허용). */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, ClipboardPaste, PencilLine, Plus, X, Check, AlertTriangle, SkipForward, CalendarDays, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useMembers } from "@/components/app/MembersProvider";
import { useAccount } from "@/lib/useAccount";
import { won, personName } from "@/lib/format";
import {
  newRow, parsePasted, checkRow, toPayload, digitsOf, formatPhone, kstToday, monthStart,
  bulkErrorText, readUndo, writeUndo, UNDO_MIN,
} from "@/lib/bulkMembers";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import NumberInput from "@/components/ui/NumberInput";
import SectionTitle from "@/components/ui/SectionTitle";
import { inputClsSm } from "@/components/ui/Field";

const MAX_ROWS = 200;

function Seg({ value, onChange, items }) {
  return (
    <div className="inline-flex rounded-full bg-elevate p-[3px]">
      {items.map((it) => (
        <button key={it.v} type="button" onClick={() => onChange(it.v)}
          className={`min-h-[34px] rounded-full px-3 text-[13px] font-semibold transition ${value === it.v ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function BulkImport() {
  const router = useRouter();
  const { members, loadMembers } = useMembers();
  const { isOwner, isCenter } = useAccount();
  const assign = Boolean(isOwner && isCenter);
  const today = kstToday();

  const [mode, setMode] = useState("type");
  const [rows, setRows] = useState(() => [newRow()]);
  const [paste, setPaste] = useState("");
  const [step, setStep] = useState("edit");     // edit | confirm | done
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);   // { added:[{id,name,kind}], skipped:[{name,reason}] }
  const [trainers, setTrainers] = useState([]);
  const [undo, setUndo] = useState(null);       // { at, added }
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoPick, setUndoPick] = useState(() => new Set());
  const [undoMsg, setUndoMsg] = useState("");
  const [now, setNow] = useState(() => new Date().getTime());
  const focusKey = useRef(null);
  const nameRefs = useRef(new Map());

  // 대표(센터) = 담당 트레이너 고르기
  useEffect(() => {
    if (!assign || !supabase) return;
    let alive = true;
    supabase.from("trainer").select("id, name, active").then(({ data }) => {
      if (alive) setTrainers((data || []).filter((t) => t.active !== false));
    });
    return () => { alive = false; };
  }, [assign]);

  // 되돌리기 정보(이 기기 · 10분) · 남은 분 표시용 시계
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUndo(readUndo());
    const t = setInterval(() => setNow(new Date().getTime()), 30000);
    return () => clearInterval(t);
  }, []);
  const undoLeft = undo ? Math.max(0, UNDO_MIN - Math.floor((now - undo.at) / 60000)) : 0;

  // 새 줄로 커서 이동
  useEffect(() => {
    const k = focusKey.current;
    if (k && nameRefs.current.get(k)) { nameRefs.current.get(k).focus(); focusKey.current = null; }
  }, [rows]);

  const existingDigits = useMemo(() => new Set((members || []).map((m) => digitsOf(m.phone_number)).filter(Boolean)), [members]);

  const patchRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]));
  const addRow = (after) => {
    const r = newRow({ trainerId: after?.trainerId || "" });
    focusKey.current = r.key;
    setRows((rs) => {
      if (rs.length >= MAX_ROWS) return rs;
      const i = after ? rs.findIndex((x) => x.key === after.key) : rs.length - 1;
      return [...rs.slice(0, i + 1), r, ...rs.slice(i + 1)];
    });
  };
  const onEnter = (e, r) => { if (e.key === "Enter") { e.preventDefault(); addRow(r); } };

  const filled = rows.filter((r) => String(r.name).trim() || String(r.phone).trim());

  // 확인 화면 줄 검사(앞줄 번호 = 목록 안 중복)
  const checked = useMemo(() => {
    const seen = new Set();
    return filled.map((r) => {
      const c = checkRow(r, { existingDigits, seenDigits: seen, today });
      const d = digitsOf(r.phone);
      if (d && !c.skip) seen.add(d);
      return { r, ...c };
    });
  }, [filled, existingDigits, today]);
  const toSend = checked.filter((c) => !c.skip);
  const blocking = toSend.filter((c) => c.errors.length);
  const sum = {
    pt: toSend.filter((c) => c.r.kind === "pt").length,
    ot: toSend.filter((c) => c.r.kind === "ot").length,
    skip: checked.length - toSend.length,
    remaining: toSend.reduce((s, c) => s + (c.r.kind === "pt" ? Number(c.r.remaining) || 0 : 0), 0),
    revenue: toSend.reduce((s, c) => s + (c.r.kind === "pt" && c.r.thisMonth ? Number(c.r.tmAmount) || 0 : 0), 0),
  };
  const missingInfo = toSend.filter((c) => !c.errors.length && c.warns.length).length;

  const splitPaste = () => {
    const parsed = parsePasted(paste);
    if (!parsed.length) { setMsg("나눌 회원을 찾지 못했어요. 한 줄에 한 명씩 붙여 넣어 주세요."); return; }
    setRows((rs) => [...rs.filter((r) => String(r.name).trim() || String(r.phone).trim()), ...parsed].slice(0, MAX_ROWS));
    setPaste("");
    setMode("type");
    setMsg(`${parsed.length}명을 나눴어요. 아래에서 확인해 주세요.`);
  };

  const goConfirm = () => {
    if (!filled.length) { setMsg("회원을 한 명 이상 입력해 주세요."); return; }
    if (filled.length > MAX_ROWS) { setMsg("한 번에 200명까지 등록할 수 있어요."); return; }
    setMsg("");
    setStep("confirm");
  };

  const save = async () => {
    if (busy) return;
    if (blocking.length) { setMsg(`고쳐야 할 줄이 ${blocking.length}개 있어요. '고치러 가기'를 눌러 주세요.`); return; }
    if (!toSend.length) { setMsg("새로 등록할 회원이 없어요. 모두 이미 있는 회원이에요."); return; }
    if (!supabase) { setMsg("데모 모드라 저장하지 않아요."); return; }
    setBusy(true);
    setMsg("");
    try {
      const { data, error } = await supabase.rpc("bulk_add_members", { p_rows: toSend.map((c) => toPayload(c.r, { isOwner: assign })) });
      if (error || !data?.ok) { console.error("회원 한꺼번에 등록 실패", error); setMsg(bulkErrorText(error)); return; }
      const added = Array.isArray(data.added) ? data.added : [];
      const skipped = [
        ...checked.filter((c) => c.skip).map((c) => ({ name: c.r.name, reason: c.skip })),
        ...(Array.isArray(data.skipped) ? data.skipped : []),
      ];
      const u = { at: new Date().getTime(), added };
      writeUndo(u);
      setUndo(u);
      setNow(u.at);
      setResult({ added, skipped, missing: missingInfo });   // 저장 뒤엔 회원 목록이 바뀌어 다시 셀 수 없음
      setStep("done");
      loadMembers();
    } catch (e) {
      console.error("회원 한꺼번에 등록 실패", e);
      setMsg("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const openUndo = () => { setUndoPick(new Set((undo?.added || []).map((a) => a.id))); setUndoMsg(""); setUndoOpen(true); };
  const doUndo = async () => {
    const ids = [...undoPick];
    if (!ids.length) { setUndoMsg("지울 회원을 골라 주세요."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("undo_bulk_members", { p_ids: ids });
      if (error || !data?.ok) { console.error("되돌리기 실패", error); setUndoMsg("되돌리지 못했어요. 다시 시도해 주세요."); return; }
      const kept = Array.isArray(data.kept) ? data.kept : [];
      const keptIds = new Set(kept.map((k) => k.id));
      const left = (undo?.added || []).filter((a) => !undoPick.has(a.id) || keptIds.has(a.id));
      const next = left.length ? { ...undo, added: left } : null;
      writeUndo(next);
      setUndo(next);
      loadMembers();
      setUndoOpen(false);
      const keptText = kept.length ? ` ${kept.length}명은 그 사이 예약 · 운동일지가 생겨서 남겨 뒀어요.` : "";
      setMsg(`${data.deleted}명을 지웠어요.${keptText}`);
      if (step === "done") { setResult(null); setRows([newRow()]); setStep("edit"); }
    } catch (e) {
      console.error("되돌리기 실패", e);
      setUndoMsg("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const undoLine = undo && undoLeft > 0 && (
    <p className="m-0 mt-3 text-[13px] text-muted">
      잘못 넣었나요?{" "}
      <button type="button" onClick={openUndo} className="font-semibold text-sub underline underline-offset-2 hover:text-ink">
        방금 등록한 {undo.added.length}명 되돌리기
      </button>{" "}· {undoLeft}분 남음
    </p>
  );

  /* ───────── ③ 완료 ───────── */
  if (step === "done" && result) {
    return (
      <div className="mx-auto max-w-xl">
        <Card padding="lg">
          <p className="m-0 flex items-center gap-2 text-[18px] font-bold text-ink"><Check className="h-5 w-5 text-cyan-700" aria-hidden="true" /> {result.added.length}명을 등록했어요</p>
          <p className="m-0 mt-2 text-[14px] leading-relaxed text-sub">이제 스케줄에서 수업을 잡아 보세요. 예약 창에 방금 넣은 회원이 다 떠요.</p>
          <div className="mt-4 grid gap-2">
            <Button variant="primary" size="lg" fullWidth onClick={() => router.push("/today")}><CalendarDays className="h-4 w-4" aria-hidden="true" /> 스케줄 잡기</Button>
            <Button variant="ghost" size="md" fullWidth onClick={() => router.push("/members")}>회원 목록 보기</Button>
          </div>
          {result.missing > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-800">
              <b className="font-semibold">기본정보 마무리가 필요한 회원 {result.missing}명</b><br />
              회당 단가 · 휴대폰이 빈 회원이에요. 홈의 &lsquo;기본정보를 마무리해 주세요&rsquo; 카드에서 채울 수 있어요.
            </div>
          )}
          {result.skipped.length > 0 && (
            <p className="m-0 mt-3 text-[13px] text-muted">이미 있거나 목록 안에서 겹쳐 건너뛴 회원: {result.skipped.map((s) => s.name).join(", ")}</p>
          )}
          {undoLine}
          {msg && <p className="m-0 mt-3 text-[13px] text-sub">{msg}</p>}
        </Card>
        {undoOpen && undoModal()}
      </div>
    );
  }

  /* ───────── ② 확인 ───────── */
  if (step === "confirm") {
    return (
      <div className="mx-auto max-w-xl">
        <SectionTitle icon={Users}>이대로 등록할까요?</SectionTitle>
        <Card padding="md">
          <p className="m-0 text-[15px] font-semibold text-ink">PT {sum.pt}명 · OT {sum.ot}명</p>
          <p className="m-0 mt-1 text-[13px] text-muted">
            {sum.skip > 0 ? `건너뜀 ${sum.skip}명 · ` : ""}남은 수업 합계 {sum.remaining}회{sum.revenue > 0 ? ` · 이번 달 매출 ${won(sum.revenue)}` : ""}
          </p>
        </Card>
        <div className="mt-3 grid gap-2">
          {checked.map(({ r, errors, warns, skip }) => (
            <div key={r.key} className="rounded-xl border border-line bg-card px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                {skip ? <SkipForward className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  : errors.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" aria-hidden="true" />
                  : warns.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  : <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" aria-hidden="true" />}
                <div className="min-w-0 flex-1 text-[14px]">
                  <span className="font-semibold text-ink">{r.name || "(이름 없음)"}</span>
                  <span className="text-muted"> · {r.kind === "pt" ? `PT · 남은 ${r.remaining || "?"}회` : "OT 예정"}{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</span>
                  {skip && <p className="m-0 text-[13px] text-muted">{skip === "exists" ? "이미 있는 회원이에요 · 건너뜀" : "위 줄과 번호가 같아요 · 건너뜀"}</p>}
                  {!skip && r.kind === "pt" && r.thisMonth && !errors.length && (
                    <p className="m-0 text-[13px] text-sub">이번 달 매출 {won(Number(r.tmAmount) || 0)} · 회당 {won(Math.round((Number(r.tmAmount) || 0) / (Number(r.tmTotal) || 1)))}</p>
                  )}
                  {!skip && errors.map((e) => <p key={e} className="m-0 text-[13px] text-danger-text">{e}</p>)}
                  {!skip && !errors.length && warns.map((w) => <p key={w} className="m-0 text-[13px] text-amber-700">{w}</p>)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {msg && <p className="m-0 mt-3 text-[13px] text-danger-text">{msg}</p>}
        <div className="mt-4 grid gap-2">
          <Button variant="primary" size="lg" fullWidth onClick={save} disabled={busy}>
            {busy ? "등록하는 중…" : `${toSend.length}명 등록하기`}
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={() => { setMsg(""); setStep("edit"); }} disabled={busy}>고치러 가기</Button>
        </div>
      </div>
    );
  }

  /* ───────── ① 입력 ───────── */
  return (
    <div className="mx-auto max-w-xl">
      <SectionTitle icon={Users} aside={<Link href="/members" className="text-[13px] font-semibold text-muted hover:text-ink">닫기</Link>}>회원 한꺼번에 등록</SectionTitle>
      <p className="m-0 mb-3 text-[13px] leading-relaxed text-sub">
        지금 맡고 있는 회원을 한 번에 넣어요. 회당 단가를 모르면 비워 두고 나중에 채워도 돼요. 건강정보(불편 부위)는 동의가 필요해서 회원마다 따로 받아요.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Seg value={mode} onChange={setMode} items={[{ v: "type", label: "바로 쓰기" }, { v: "paste", label: "붙여 넣기" }]} />
        {assign && trainers.length > 0 && (
          <select defaultValue="" onChange={(e) => { const v = e.target.value; if (v) setRows((rs) => rs.map((r) => ({ ...r, trainerId: v }))); }}
            className={`${inputClsSm} w-auto`} aria-label="모두 같은 담당 트레이너">
            <option value="">담당 트레이너 모두 같게…</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{personName(t.name)}</option>)}
          </select>
        )}
      </div>
      {undoLine}

      {mode === "paste" ? (
        <Card padding="md">
          <p className="m-0 mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink"><ClipboardPaste className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 엑셀 · 메모 · 카톡 목록을 그대로 붙여 넣어요</p>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8}
            placeholder={"한 줄에 한 명씩\n김민수 010-1234-5678 남은 12회 6만원\n이서연 01098765432 8\n박지훈 OT예정 010-5555-1234"}
            className="w-full rounded-lg border border-line bg-elevate px-3 py-2.5 text-[14px] leading-relaxed text-ink placeholder-muted outline-none focus:border-primary" />
          <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-muted">이름 · 휴대폰 · 남은 수업(○회) · 회당 단가(○원 · ○만)를 알아서 나눠요. &lsquo;OT&rsquo;가 있으면 OT 예정 회원이에요.</p>
          <div className="mt-3"><Button variant="primary" size="md" fullWidth onClick={splitPaste}><PencilLine className="h-4 w-4" aria-hidden="true" /> 목록으로 나누기</Button></div>
        </Card>
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-[12px] text-muted">{i + 1}</span>
                <input ref={(el) => { if (el) nameRefs.current.set(r.key, el); else nameRefs.current.delete(r.key); }}
                  value={r.name} onChange={(e) => patchRow(r.key, { name: e.target.value })} placeholder="이름"
                  className={`${inputClsSm} min-w-0 flex-1`} aria-label={`${i + 1}번 이름`} />
                <input value={r.phone} onChange={(e) => patchRow(r.key, { phone: e.target.value })} onBlur={() => patchRow(r.key, { phone: formatPhone(r.phone) })}
                  placeholder="010-0000-0000" type="tel" inputMode="numeric" className={`${inputClsSm} min-w-0 flex-[1.3]`} aria-label={`${i + 1}번 휴대폰`}
                  onKeyDown={r.kind === "ot" ? (e) => onEnter(e, r) : undefined} />
                <button type="button" onClick={() => removeRow(r.key)} aria-label={`${i + 1}번 줄 지우기`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-elevate hover:text-ink">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                <Seg value={r.kind} onChange={(v) => patchRow(r.key, { kind: v })} items={[{ v: "pt", label: "PT 진행 중" }, { v: "ot", label: "OT 예정" }]} />
                {r.kind === "pt" && (
                  <>
                    <div className="w-[104px]"><NumberInput size="sm" value={r.remaining} onValueChange={(v) => patchRow(r.key, { remaining: v })} placeholder="남은 수업" suffix="회" aria-label={`${i + 1}번 남은 수업`} /></div>
                    {!r.thisMonth && (
                      <div className="min-w-[150px] flex-1"><NumberInput size="sm" value={r.price} onValueChange={(v) => patchRow(r.key, { price: v })} placeholder="회당 단가 (모르면 비움)" suffix="원"
                        aria-label={`${i + 1}번 회당 단가`} onKeyDown={(e) => onEnter(e, r)} /></div>
                    )}
                  </>
                )}
              </div>
              {r.kind === "pt" && (
                <div className="mt-2 pl-7">
                  <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-[13px] font-semibold text-sub">
                    <input type="checkbox" checked={r.thisMonth} className="h-4 w-4 accent-red-600"
                      onChange={(e) => patchRow(r.key, { thisMonth: e.target.checked, tmDate: r.tmDate || today })} />
                    이번 달 등록 <span className="font-normal text-muted">· 이번 달 매출로 잡혀요</span>
                  </label>
                  {r.thisMonth ? (
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <input type="date" value={r.tmDate} min={monthStart(today)} max={today} onChange={(e) => patchRow(r.key, { tmDate: e.target.value })}
                        className={inputClsSm} aria-label={`${i + 1}번 등록일`} />
                      <Seg value={r.tmKind} onChange={(v) => patchRow(r.key, { tmKind: v })} items={[{ v: "new", label: "신규" }, { v: "reregister", label: "재등록" }]} />
                      <NumberInput size="sm" value={r.tmAmount} onValueChange={(v) => patchRow(r.key, { tmAmount: v })} placeholder="결제 금액" suffix="원" aria-label={`${i + 1}번 결제 금액`} />
                      <NumberInput size="sm" value={r.tmTotal} onValueChange={(v) => patchRow(r.key, { tmTotal: v })} placeholder="등록 횟수" suffix="회" aria-label={`${i + 1}번 등록 횟수`}
                        onKeyDown={(e) => onEnter(e, r)} />
                      {Number(r.tmAmount) > 0 && Number(r.tmTotal) > 0 && (
                        <p className="col-span-2 m-0 text-[12px] text-muted">회당 {won(Math.round(Number(r.tmAmount) / Number(r.tmTotal)))} · 이미 한 수업 {Math.max(0, Number(r.tmTotal) - (Number(r.remaining) || 0))}회</p>
                      )}
                    </div>
                  ) : (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-[12px] text-muted">더 보기 · 이번 달 앱 쓰기 전에 한 수업</summary>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="w-[104px]"><NumberInput size="sm" value={r.pre} onValueChange={(v) => patchRow(r.key, { pre: v })} placeholder="0" suffix="회" aria-label={`${i + 1}번 이번 달 앱 쓰기 전 수업`} /></div>
                        <span className="text-[12px] leading-relaxed text-muted">첫 달 급여 안내에만 쓰여요</span>
                      </div>
                    </details>
                  )}
                </div>
              )}
              {assign && trainers.length > 0 && (
                <div className="mt-2 pl-7">
                  <select value={r.trainerId} onChange={(e) => patchRow(r.key, { trainerId: e.target.value })} className={`${inputClsSm} w-auto`} aria-label={`${i + 1}번 담당 트레이너`}>
                    <option value="">담당: 나</option>
                    {trainers.map((t) => <option key={t.id} value={t.id}>담당: {personName(t.name)}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => addRow(rows[rows.length - 1])}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[14px] font-semibold text-sub hover:bg-elevate hover:text-ink">
            <Plus className="h-4 w-4" aria-hidden="true" /> 다음 회원 (엔터)
          </button>
        </div>
      )}

      {msg && <p className="m-0 mt-3 text-[13px] text-sub">{msg}</p>}
      {mode === "type" && (
        <div className="mt-4"><Button variant="primary" size="lg" fullWidth onClick={goConfirm}>확인하기 · {filled.length}명</Button></div>
      )}
      {undoOpen && undoModal()}
    </div>
  );

  // 함수로 불러 그린다(컴포넌트로 만들면 렌더마다 새로 붙어 입력 · 포커스가 끊김)
  function undoModal() {
    return (
      <Modal title="방금 등록한 회원 지우기" onClose={() => setUndoOpen(false)}
        footer={(
          <div className="flex w-full gap-2">
            <Button variant="ghost" size="md" fullWidth onClick={() => setUndoOpen(false)} disabled={busy}>그만두기</Button>
            <Button variant="danger" size="md" fullWidth onClick={doUndo} disabled={busy}>{busy ? "지우는 중…" : `${undoPick.size}명 지우기`}</Button>
          </div>
        )}>
        <p className="m-0 mb-2 text-[13px] leading-relaxed text-sub">체크한 회원과 같이 넣은 남은 수업을 지워요. 그 사이 예약이나 운동일지가 생긴 회원은 남겨 둬요.</p>
        <ul className="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
          {(undo?.added || []).map((a) => (
            <li key={a.id}>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[14px] hover:bg-elevate">
                <input type="checkbox" className="h-4 w-4 accent-red-600" checked={undoPick.has(a.id)}
                  onChange={(e) => setUndoPick((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                <span className="text-ink">{a.name}</span><span className="text-[12px] text-muted">{a.kind === "pt" ? "PT" : "OT"}</span>
              </label>
            </li>
          ))}
        </ul>
        {undoMsg && <p className="m-0 mt-2 text-[13px] text-danger-text">{undoMsg}</p>}
        <p className="m-0 mt-2 flex items-center gap-1 text-[12px] text-muted"><Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {undoLeft}분 뒤에는 되돌릴 수 없어요</p>
      </Modal>
    );
  }
}

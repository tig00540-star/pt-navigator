"use client";

/* =========================================================================
   월별 수업 확인서(2026-10-06 · 대표 결정) — 한 회원 · 한 달의 수업을 한 장으로(인쇄 · PDF 저장).
   줄마다: 날짜 · 시각 / 수업 내용(종목 요약) / 확인(직접 확인 · 자동 확인 · 내용이 달라요 · 미확인 · 노쇼) / 회원 서명 그림.
   · 자동 확인인데 서명이 없으면 '자동 확인(서명 없음)'으로 정직하게 · 서명은 회원이 직접 한 것만.
   · 데이터는 PtWorkoutTab이 이미 가진 logs · confirms · 서명(sigs: log_id → {url, signed_at, after_auto})을 그대로 받는다.
   · 화면 위에 덮는 포털(body) · 인쇄할 때는 이 장만 나온다(@media print로 나머지 숨김).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Printer, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { openDispute } from "@/lib/workoutHash";
import { personName } from "@/lib/format";

const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600000);
const ymOf = (iso) => kst(iso).toISOString().slice(0, 7);
const DOW = "일월화수목금토";
const when = (iso) => { const d = kst(iso); const h = d.getUTCHours(); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const stamp = (iso) => { const d = kst(iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

function summary(log) {
  const ex = (Array.isArray(log.sets_structured) ? log.sets_structured : []).filter((e) => e?.exercise);
  if (ex.length) {
    const sets = ex.reduce((n, e) => n + (Array.isArray(e.sets) ? e.sets.length : 0), 0);
    return `${ex[0].exercise}${ex.length > 1 ? ` 외 ${ex.length - 1}종목` : ""}${sets ? ` · ${sets}세트` : ""}`;
  }
  const t = String(log.ai_summary || "").split("\n").map((x) => x.trim()).find((x) => x && !x.startsWith("["));
  return t ? t.slice(0, 40) : "수업 기록";
}

export default function AttestSheet({ member, logs = [], confirms = [], sigs = new Map(), onClose }) {
  const months = useMemo(() => [...new Set(logs.filter((l) => !l.voided).map((l) => ymOf(l.session_at ?? l.created_at)))].sort().reverse(), [logs]);
  const [ym, setYm] = useState(() => months[0] || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7));
  const [head, setHead] = useState({ center: "", trainer: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const [{ data: t }, { data: a }] = await Promise.all([
        member?.trainer_id ? supabase.from("trainer").select("name").eq("id", member.trainer_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("account").select("name").maybeSingle(),
      ]);
      if (alive) setHead({ center: a?.name || "", trainer: personName(t?.name) || "" });
    })();
    return () => { alive = false; };
  }, [member?.trainer_id]);

  const rows = logs.filter((l) => !l.voided && ymOf(l.session_at ?? l.created_at) === ym)
    .sort((a, b) => Date.parse(a.session_at ?? a.created_at) - Date.parse(b.session_at ?? b.created_at));
  const confOf = (id) => confirms.filter((c) => c.log_id === id);
  const status = (l) => {
    if (l.source === "noshow") return { t: "노쇼", sub: "" };
    const cs = confOf(l.id), c = cs.find((x) => x.result === "confirm"), s = sigs.get(l.id);
    if (c?.method === "auto") return { t: s ? "자동 확인 · 서명" : "자동 확인(서명 없음)", sub: stamp(c.confirmed_at) };
    if (c) return { t: "회원 확인", sub: stamp(c.confirmed_at) };
    if (openDispute(l, cs)) return { t: "내용이 달라요", sub: "트레이너 확인 중" };
    return { t: "미확인", sub: "" };
  };
  const counted = rows.filter((l) => l.source !== "noshow").length;
  const signed = rows.filter((l) => sigs.get(l.id)).length;
  const idx = months.indexOf(ym);
  const [yy, mm] = ym.split("-").map(Number);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div id="attest-root" className="fixed inset-0 z-[140] overflow-y-auto bg-white text-ink">
      <style>{`@media print { body > *:not(#attest-root) { display: none !important; } #attest-root { position: static !important; overflow: visible !important; } .no-print { display: none !important; } @page { size: A4; margin: 14mm; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white/95 px-4 py-2 backdrop-blur">
        <button type="button" onClick={() => idx < months.length - 1 && setYm(months[idx + 1])} disabled={idx >= months.length - 1} aria-label="이전 달" className="flex h-10 w-10 items-center justify-center rounded-lg text-sub disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-[15px] font-bold">{yy}년 {mm}월</span>
        <button type="button" onClick={() => idx > 0 && setYm(months[idx - 1])} disabled={idx <= 0} aria-label="다음 달" className="flex h-10 w-10 items-center justify-center rounded-lg text-sub disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[14px] font-semibold text-white"><Printer className="h-4 w-4" /> 인쇄 · PDF 저장</button>
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-lg text-sub"><X className="h-5 w-5" /></button>
      </div>

      <div className="mx-auto max-w-[780px] px-5 py-6">
        <h1 className="m-0 text-center text-[24px] font-extrabold tracking-[-0.02em]">수업 확인서</h1>
        <p className="m-0 mt-1 text-center text-[14px] text-sub">{yy}년 {mm}월{head.center ? ` · ${head.center}` : ""}</p>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-line px-4 py-3 text-[14px] sm:grid-cols-4">
          <span className="text-sub">회원</span><b>{member?.name || ""}</b>
          <span className="text-sub">담당 트레이너</span><b>{head.trainer || "—"}</b>
          <span className="text-sub">수업</span><b>{counted}회{rows.length > counted ? ` (노쇼 ${rows.length - counted}회)` : ""}</b>
          <span className="text-sub">회원 서명</span><b>{signed}회</b>
        </div>

        {rows.length === 0 ? <p className="mt-6 text-center text-[14px] text-muted">이 달에는 수업 기록이 없어요.</p> : (
          <table className="mt-5 w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-y-2 border-ink text-left">
                <th className="py-2 pr-2 font-bold">수업 날짜</th>
                <th className="py-2 pr-2 font-bold">수업 내용</th>
                <th className="py-2 pr-2 font-bold">확인</th>
                <th className="w-[120px] py-2 font-bold">회원 서명</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const st = status(l), s = sigs.get(l.id);
                return (
                  <tr key={l.id} className="border-b border-line align-middle [break-inside:avoid]">
                    <td className="whitespace-nowrap py-2 pr-2 tabular-nums">{when(l.session_at ?? l.created_at)}</td>
                    <td className="py-2 pr-2">{summary(l)}</td>
                    <td className="py-2 pr-2"><span className="font-semibold">{st.t}</span>{st.sub && <span className="block text-[12px] text-sub tabular-nums">{st.sub}</span>}</td>
                    <td className="py-1.5">
                      {s?.url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.url} alt="회원 서명" className="h-10 w-auto" />
                          <span className="block text-[11.5px] text-sub tabular-nums">{stamp(s.signed_at)}</span>
                        </>
                      ) : <span className="text-[12px] text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="m-0 mt-5 text-[12px] leading-relaxed text-muted">
          확인 시각 · 서명 시각은 서버 기록이에요. &lsquo;자동 확인&rsquo;은 회원이 안내받은 기한 안에 이의가 없어 확인으로 처리된 수업이에요.
          출력일 {new Date().toLocaleDateString("ko-KR")} · 오직 트레이너
        </p>
      </div>
    </div>,
    document.body,
  );
}

"use client";

/* =========================================================================
   세일즈북 2단계 부품 — 사례 장 본문(CaseSlideBody) · 장 구성 패널(DeckPanel) · 사례 불러오기 훅(useDeckCases).
   SalesbookView가 쓴다. 숫자·사진은 사례 보관함 스냅샷 그대로(AI가 다시 쓰지 않는다 — 틀린 숫자 방지).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import CaseCard from "@/components/salesbook/CaseCard";
import { signCaseUrls, loadMyCases } from "@/components/salesbook/caseData";
import { slideLabel } from "@/components/salesbook/deck";
import { CASE_CATEGORIES, caseKindLabel, deltaText } from "@/lib/salesCase";

// 세일즈북에 담긴 사례 id들 → 행 + 서명 URL.
export function useDeckCases(ids) {
  const key = (ids || []).join(",");
  const [state, setState] = useState({ rows: [], urls: {} });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = key ? key.split(",") : [];
      if (!supabase || !list.length) { if (!cancelled) setState({ rows: [], urls: {} }); return; }
      const { data } = await supabase.from("sales_case").select("*").in("id", list);
      const rows = list.map((id) => (data || []).find((r) => r.id === id)).filter(Boolean);
      const urls = await signCaseUrls(rows);
      if (!cancelled) setState({ rows, urls });
    })();
    return () => { cancelled = true; };
  }, [key]);
  return state;
}

// 사례 장 — '이런 변화를 만들어요'. 회원 목표와 같은 목적이면 제목이 그걸 짚는다.
export function CaseSlideBody({ cases, urls, memberCategory, SlideHead }) {
  const same = memberCategory && cases.some((c) => c.data?.category === memberCategory);
  return (
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="이런 변화를 만들어요" aux={same ? `같은 ${memberCategory} 목표였던 회원` : "실제 기록 그대로예요"} className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className={`sb-stg mt-2 grid flex-1 gap-3 ${cases.length > 1 ? "grid-cols-2" : "mx-auto w-full max-w-[420px] grid-cols-1"}`} style={{ "--sb-i": 1 }}>
        {cases.map((c) => <CaseCard key={c.id} item={c} urls={urls} />)}
      </div>
    </div>
  );
}

// 보관함 행 한 줄 요약(고르는 목록용).
function caseSummary(c) {
  const d = c.data || {};
  if (c.kind === "photo") return `사진 2장${d.weeks ? ` · ${d.weeks}주` : ""}`;
  if (c.kind === "lift") return `${d.exercise} ${d.first}→${d.latest}kg`;
  if (c.kind === "inbody") {
    const m = (d.metrics || []).find((x) => x.key === "body_fat_pct") || (d.metrics || [])[0];
    return m ? `${m.label} ${deltaText(m.first, m.latest, m.unit)}` : "인바디";
  }
  return c.note || "후기 캡처";
}

/* 장 구성 패널(편집 화면 전용) — 장 켜기·끄기 · 순서 · 사례 넣기.
   deck = { order, hidden, cases } · allKeys = 지금 보이는 순서(숨긴 장 포함) · onChange(nextDeck). */
export function DeckPanel({ deck, allKeys, memberCategory, onChange, onClose }) {
  const d = deck || {};
  const hidden = new Set(d.hidden || []);
  const chosen = d.cases || [];
  const [mine, setMine] = useState(null);
  const [cat, setCat] = useState(memberCategory || "all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setMine([]); return; }
      const { data: au } = await supabase.auth.getUser();
      const { data } = await loadMyCases(au?.user?.id);
      if (!cancelled) setMine(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const listed = useMemo(() => (mine || []).filter((c) => cat === "all" || c.data?.category === cat), [mine, cat]);

  const move = (k, dir) => {
    const order = [...allKeys];
    const i = order.indexOf(k), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ ...d, order });
  };
  const toggleHide = (k) => {
    const h = new Set(hidden);
    if (h.has(k)) h.delete(k); else h.add(k);
    onChange({ ...d, order: allKeys, hidden: [...h] });
  };
  const toggleCase = (id) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    onChange({ ...d, order: allKeys, cases: next });
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(380px,94vw)] flex-col border-l border-line bg-card text-ink shadow-2xl print:hidden" aria-label="장 구성">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="m-0 text-[15px] font-bold">장 구성</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1 text-muted hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section>
          <p className="m-0 mb-2 text-[12px] font-semibold text-sub">순서 · 보이기 <span className="font-normal text-muted">끈 장은 회원에게 안 보여요</span></p>
          <ol className="m-0 list-none space-y-1.5 p-0">
            {allKeys.map((k, i) => {
              const off = hidden.has(k);
              return (
                <li key={k} className={`flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 ${off ? "bg-elevate text-muted" : "bg-card"}`}>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{slideLabel(k)}</span>
                  <button type="button" onClick={() => move(k, -1)} disabled={i === 0} aria-label="위로" className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(k, 1)} disabled={i === allKeys.length - 1} aria-label="아래로" className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => toggleHide(k)} aria-label={off ? "보이기" : "숨기기"} aria-pressed={!off} className="rounded p-1 text-muted hover:text-ink">
                    {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section>
          <p className="m-0 mb-2 text-[12px] font-semibold text-sub">사례 넣기 <span className="font-normal text-muted">2개씩 한 장이 돼요</span></p>
          <div className="mb-2 flex flex-wrap gap-1">
            {["all", ...CASE_CATEGORIES].map((k) => (
              <button key={k} type="button" onClick={() => setCat(k)} aria-pressed={cat === k}
                className={`min-h-[30px] rounded-full border px-2.5 text-[12px] ${cat === k ? "border-ink bg-ink font-semibold text-white" : "border-line text-sub"}`}>
                {k === "all" ? "전체" : k}{k === memberCategory ? " · 이 회원" : ""}
              </button>
            ))}
          </div>
          {mine == null ? <p className="m-0 text-[12px] text-muted">불러오는 중…</p>
            : listed.length === 0 ? <p className="m-0 text-[12px] text-muted">{(mine || []).length ? "이 목적의 사례가 없어요." : "사례 보관함이 비어 있어요. 세일즈북 › 사례 보관함에서 담아 주세요."}</p>
            : (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {listed.map((c) => {
                  const on = chosen.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => toggleCase(c.id)} aria-pressed={on}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${on ? "border-primary bg-primary-soft" : "border-line bg-card"}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] font-bold ${on ? "border-primary bg-primary text-white" : "border-line-strong"}`}>{on ? chosen.indexOf(c.id) + 1 : ""}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{c.label || "회원"}</span>
                          <span className="block truncate text-[12px] text-muted">{caseKindLabel(c.kind)}{c.data?.category ? ` · ${c.data.category}` : ""} · {caseSummary(c)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>
      </div>
      <p className="m-0 border-t border-line px-4 py-3 text-[12px] text-muted">바꾼 뒤 위의 &lsquo;저장&rsquo;을 눌러야 남아요.</p>
    </aside>
  );
}

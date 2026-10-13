"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 링크(사례 카드와 같음) */

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
import { CASE_CATEGORIES, careSubLabel, caseKindLabel, deltaText, improved, shortDay } from "@/lib/salesCase";
import { caseUsable } from "@/lib/trainerIntro";
import Sparkline from "@/components/ui/Sparkline";

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
      // 사진 · 후기는 동의 체크한 것만(예전에 넣어 둔 세일즈북도 체크 전이면 빠짐 · 2026-10-11)
      const rows = list.map((id) => (data || []).find((r) => r.id === id)).filter(caseUsable);
      const urls = await signCaseUrls(rows);
      if (!cancelled) setState({ rows, urls });
    })();
    return () => { cancelled = true; };
  }, [key]);
  return state;
}

// 사례 한 건의 '한눈에 보이는 숫자' — 1건짜리 장에서 크게 보여 준다(숫자는 스냅샷 그대로).
function caseHighlight(c) {
  const d = c.data || {};
  if (c.kind === "inbody") {
    const ms = d.metrics || [];
    const order = ["body_fat_pct", "weight", "skeletal_muscle", "body_fat_mass"];
    const m = order.map((k) => ms.find((x) => x.key === k && improved(x))).find(Boolean) || ms.find(improved) || ms[0];
    return m ? { big: `${m.label} ${deltaText(m.first, m.latest, m.unit)}`, sub: `${m.first}${m.unit} → ${m.latest}${m.unit}${d.weeks ? ` · ${d.weeks}주` : ""}` } : null;
  }
  if (c.kind === "lift") return { big: `${d.exercise} ${deltaText(d.first, d.latest, "kg")}`, sub: `${d.first}kg → ${d.latest}kg${d.weeks ? ` · ${d.weeks}주` : ""}` };
  if (c.kind === "photo") return { big: d.weeks ? `${d.weeks}주의 변화` : "처음과 지금", sub: "실제 사진 그대로예요" };
  return { big: "회원님이 직접 보내 주신 메시지", sub: "" };
}

// 숫자 사례 1건짜리 장의 오른쪽 — 카드보다 크게(인바디 = 지표 줄 · 운동 = 큰 숫자 + 추이선). 숫자는 스냅샷 그대로.
function BigNumbers({ c }) {
  const d = c.data || {};
  const span = <p className="m-0 mt-3 text-[clamp(13px,1.5vw,15px)] text-muted">{shortDay(d.from)} → {shortDay(d.to)}{d.weeks ? ` · ${d.weeks}주` : ""}{d.sessions ? ` · ${d.sessions}회 기록` : ""}</p>;
  if (c.kind === "lift") {
    return (
      <div className="rounded-2xl border border-line bg-elevate p-[clamp(18px,2.4vw,28px)]">
        <p className="m-0 text-[clamp(15px,1.8vw,19px)] font-semibold text-sub">{d.exercise}</p>
        <p className="m-0 mt-1 text-[clamp(30px,4.4vw,50px)] font-extrabold tabular-nums tracking-[-0.03em] text-ink">{d.first}kg → {d.latest}kg</p>
        <div className="mt-3 h-[clamp(48px,7vw,84px)] [&_svg]:h-full"><Sparkline values={d.points} /></div>
        {span}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-elevate p-[clamp(14px,2vw,22px)]">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(d.metrics || []).map((m) => (
          <li key={m.key} className="flex items-baseline justify-between gap-3 rounded-xl bg-card px-[clamp(14px,1.8vw,20px)] py-[clamp(12px,1.6vw,18px)]">
            <span className="text-[clamp(14px,1.7vw,18px)] text-sub">{m.label}</span>
            <span className="text-[clamp(18px,2.4vw,26px)] tabular-nums text-ink">
              {m.first}{m.unit} → <b className="font-bold">{m.latest}{m.unit}</b>
              <span className={`ml-2 text-[clamp(14px,1.7vw,18px)] font-semibold ${improved(m) ? "text-primary-strong" : "text-muted"}`}>{deltaText(m.first, m.latest, m.unit)}</span>
            </span>
          </li>
        ))}
      </ul>
      {span}
    </div>
  );
}

// 사례 장 — '이런 변화를 만들어요'. 회원 목표와 같은 목적이면 제목이 그걸 짚는다.
//   1건이면 왼쪽에 큰 숫자 · 오른쪽에 카드(장이 비어 보이지 않게 · 2026-10-11).
export function CaseSlideBody({ cases, urls, memberCategory, SlideHead }) {
  const same = memberCategory && cases.some((c) => c.data?.category === memberCategory);
  if (cases.length === 1) {
    const c = cases[0];
    const h = caseHighlight(c);
    return (
      <div className="flex h-full flex-col">
        <SlideHead eyebrow="이런 변화를 만들어요" aux={same ? `같은 ${memberCategory} 목표였던 회원` : "실제 기록 그대로예요"} className="sb-stg" style={{ "--sb-i": 0 }} />
        {/* .sb-fit은 min-height라 h-full이 안 먹는다 → 높이를 직접 줘 장을 채운다(넘치면 fit-scale이 줄임) */}
        <div className="grid min-h-[min(56vh,460px)] flex-1 items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="sb-stg flex min-w-0 flex-col gap-3" style={{ "--sb-i": 1 }}>
            <span className="text-[13px] font-semibold text-sub">{caseKindLabel(c.kind)}{c.data?.category ? ` · ${c.data.category}` : ""}</span>
            <p className="m-0 text-[clamp(20px,2.6vw,28px)] font-bold tracking-[-0.02em] text-ink">{c.label || "회원"}</p>
            {h && <p className="m-0 break-keep text-[clamp(30px,4.6vw,52px)] font-extrabold leading-tight tracking-[-0.03em] text-primary-strong">{h.big}</p>}
            {h?.sub && <p className="m-0 text-[clamp(14px,1.7vw,18px)] tabular-nums text-sub">{h.sub}</p>}
            {c.note && <p className="m-0 max-w-[36ch] text-[clamp(14px,1.6vw,17px)] leading-relaxed text-sub">{c.note}</p>}
          </div>
          <div className="sb-stg min-w-0" style={{ "--sb-i": 2 }}>
            {c.kind === "inbody" || c.kind === "lift" ? <BigNumbers c={c} /> : <CaseCard item={{ ...c, note: null }} urls={urls} />}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="이런 변화를 만들어요" aux={same ? `같은 ${memberCategory} 목표였던 회원` : "실제 기록 그대로예요"} className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className={`sb-stg mt-2 grid flex-1 gap-3 ${cases.length > 1 ? "grid-cols-2" : "mx-auto w-full max-w-[420px] grid-cols-1"}`} style={{ "--sb-i": 1 }}>
        {cases.map((c) => <CaseCard key={c.id} item={c} urls={urls} />)}
      </div>
    </div>
  );
}

// 관리 모습 장(1차 OT 변화 모음집) — 대화 캡처 · 회원 페이지 화면을 2개씩.
//   캡처는 세로로 긴 폰 화면이라 잘리지 않게 통째로(contain) 보여 주고, 제목 · 메모는 위아래 짧게.
export function CareSlideBody({ items, urls, SlideHead }) {
  return (
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="회원님 관리, 이렇게 해요" aux="실제 캡처 그대로예요" className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className={`sb-stg mt-1 grid flex-1 gap-4 ${items.length > 1 ? "grid-cols-2" : "mx-auto w-full max-w-[560px] grid-cols-1"}`} style={{ "--sb-i": 1 }}>
        {items.map((c) => (
          <figure key={c.id} className="m-0 flex min-w-0 flex-col gap-2">
            <figcaption className="min-w-0">
              <span className="block text-[12px] font-semibold text-sub">{careSubLabel(c.data?.sub)}</span>
              <span className="block break-keep text-[clamp(15px,1.9vw,20px)] font-bold leading-snug tracking-[-0.02em] text-ink">{c.label}</span>
            </figcaption>
            <div className="flex h-[min(50vh,430px)] items-center justify-center overflow-hidden rounded-xl border border-line bg-elevate">
              {urls[c.data?.path]
                ? <img src={urls[c.data.path]} alt={c.label || "관리 모습 캡처"} className="h-full w-full object-contain" />
                : <span className="text-[13px] text-muted">캡처를 불러오지 못했어요</span>}
            </div>
            {c.note && <p className="m-0 text-[clamp(13px,1.5vw,15px)] leading-snug text-sub">{c.note}</p>}
          </figure>
        ))}
      </div>
    </div>
  );
}

// 보관함 행 한 줄 요약(고르는 목록용).
export function caseSummary(c) {
  const d = c.data || {};
  if (c.kind === "photo") return `${d.combined ? "비포 · 애프터 사진 1장" : "사진 2장"}${d.weeks ? ` · ${d.weeks}주` : ""}`;
  if (c.kind === "lift") return `${d.exercise} ${d.first}→${d.latest}kg`;
  if (c.kind === "inbody") {
    const m = (d.metrics || []).find((x) => x.key === "body_fat_pct") || (d.metrics || [])[0];
    return m ? `${m.label} ${deltaText(m.first, m.latest, m.unit)}` : "인바디";
  }
  if (c.kind === "care") return c.note || "관리 모습 캡처";
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

  const listed = useMemo(() => (mine || []).filter((c) => c.kind !== "care" && (cat === "all" || c.data?.category === cat)), [mine, cat]);

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
                  const ok = caseUsable(c);   // 사진 · 후기는 동의 체크한 것만 넣을 수 있다(이미 넣은 건 빼기만 가능)
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => (ok || on) && toggleCase(c.id)} aria-pressed={on} disabled={!ok && !on}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left disabled:opacity-60 ${on ? "border-primary bg-primary-soft" : "border-line bg-card"}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] font-bold ${on ? "border-primary bg-primary text-white" : "border-line-strong"}`}>{on ? chosen.indexOf(c.id) + 1 : ""}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{c.label || "회원"}</span>
                          <span className="block truncate text-[12px] text-muted">{caseKindLabel(c.kind)}{c.data?.category ? ` · ${c.data.category}` : ""} · {caseSummary(c)}</span>
                          {!ok && <span className="block text-[12px] text-muted">회원 동의 체크 전이라 넣을 수 없어요(사례 보관함에서 체크)</span>}
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

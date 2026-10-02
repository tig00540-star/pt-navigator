"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 URL·로컬 미리보기 이미지라 next/image 최적화 대상이 아니다(기존 사진 화면과 같음). */

/* =========================================================================
   CaseCard — 사례 한 건 표시(사례 보관함 · 2단계 세일즈북 장에서도 같이 쓴다).
   종류: photo(비포·애프터 2장) · inbody(전후 숫자) · lift(종목 최고중량 전후 + 추이) · review(후기 캡처).
   숫자는 담을 때 스냅샷(data) 그대로 — 여기서 계산하지 않는다(변화량 표기만).
   실명은 쓰지 않는다 — label(익명 라벨)만.
   ========================================================================= */

import { ImageOff, MessageSquareQuote, Trash2 } from "lucide-react";
import Sparkline from "@/components/ui/Sparkline";
import { CASE_CATEGORIES, caseKindLabel, deltaText, improved, shortDay } from "@/lib/salesCase";

function Photo({ url, cap, onOpen }) {
  return (
    <figure className="m-0 min-w-0 flex-1">
      <button type="button" onClick={() => url && onOpen?.(url)} disabled={!url}
        className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-elevate">
        {url ? <img src={url} alt={cap} className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-muted" aria-label="사진 없음" />}
      </button>
      <figcaption className="mt-1 text-center text-[12px] text-sub">{cap}</figcaption>
    </figure>
  );
}

export default function CaseCard({ item, urls = {}, onOpenImage, onDelete, onCategory, busy }) {
  const d = item.data || {};
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-3.5 shadow-sm">
      <header className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold text-sub">
            {caseKindLabel(item.kind)}{!onCategory && d.category ? ` · ${d.category}` : ""}
          </span>
          <p className="m-0 truncate text-[15px] font-bold tracking-[-0.02em] text-ink">{item.label || "회원"}</p>
        </div>
        {onCategory && (
          <select value={d.category || ""} onChange={(e) => onCategory(item, e.target.value)} disabled={busy} aria-label="목적"
            className="ml-auto h-8 shrink-0 rounded-lg border border-line bg-elevate px-2 text-[12px] text-sub">
            <option value="">목적 없음</option>
            {CASE_CATEGORIES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        {onDelete && (
          <button type="button" onClick={() => onDelete(item)} disabled={busy} aria-label="사례 빼기"
            className="rounded-md p-1.5 text-muted transition hover:bg-elevate hover:text-danger-text disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      {item.kind === "photo" && (
        <>
          <div className="flex gap-2">
            <Photo url={urls[d.before?.path]} cap={`처음 · ${shortDay(d.before?.taken_on)}`} onOpen={onOpenImage} />
            <Photo url={urls[d.after?.path]} cap={`지금 · ${shortDay(d.after?.taken_on)}`} onOpen={onOpenImage} />
          </div>
          {!urls[d.before?.path] && !urls[d.after?.path] && (
            <p className="m-0 mt-1.5 text-[12px] text-muted">사진을 불러오지 못했어요. 회원이 사진을 지웠을 수 있어요.</p>
          )}
        </>
      )}

      {item.kind === "inbody" && (
        <ul className="m-0 list-none space-y-1.5 p-0">
          {(d.metrics || []).map((m) => (
            <li key={m.key} className="flex items-baseline justify-between gap-2 rounded-lg bg-elevate px-3 py-2">
              <span className="text-[13px] text-sub">{m.label}</span>
              <span className="text-[14px] tabular-nums text-ink">
                {m.first}{m.unit} → <b className="font-semibold">{m.latest}{m.unit}</b>
                <span className={`ml-1.5 text-[12px] font-semibold ${improved(m) ? "text-primary-strong" : "text-muted"}`}>{deltaText(m.first, m.latest, m.unit)}</span>
              </span>
            </li>
          ))}
          <li className="text-[12px] text-muted">{shortDay(d.from)} → {shortDay(d.to)}{d.weeks ? ` · ${d.weeks}주` : ""}</li>
        </ul>
      )}

      {item.kind === "lift" && (
        <div className="rounded-lg bg-elevate px-3 py-2.5">
          <p className="m-0 text-[13px] text-sub">{d.exercise}</p>
          <p className="m-0 mt-0.5 text-[18px] font-bold tabular-nums tracking-[-0.02em] text-ink">
            {d.first}kg → {d.latest}kg
            <span className="ml-1.5 text-[13px] font-semibold text-primary-strong">{deltaText(d.first, d.latest, "kg")}</span>
          </p>
          <Sparkline values={d.points} />
          <p className="m-0 mt-1 text-[12px] text-muted">{shortDay(d.from)} → {shortDay(d.to)}{d.weeks ? ` · ${d.weeks}주` : ""}{d.sessions ? ` · ${d.sessions}회 기록` : ""}</p>
        </div>
      )}

      {item.kind === "review" && (
        <>
          {urls[d.path] ? (
            <button type="button" onClick={() => onOpenImage?.(urls[d.path])}
              className="block max-h-[320px] overflow-hidden rounded-lg border border-line bg-elevate">
              <img src={urls[d.path]} alt="회원 후기" className="w-full object-cover object-top" />
            </button>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-lg bg-elevate"><MessageSquareQuote className="h-5 w-5 text-muted" aria-label="후기 이미지 없음" /></div>
          )}
        </>
      )}

      {item.note && <p className="m-0 mt-2 text-[13px] leading-relaxed text-sub">{item.note}</p>}
    </article>
  );
}

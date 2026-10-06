"use client";

/* =========================================================================
   PriceSheet — 회원이 "가격표 보여주세요" 할 때 바로 띄우는 PT 가격표(2026-10-02 대표 요청).
   AI가 만들지 않는다 — 설정 › 정산 › PT 가격의 패키지(pt_package · 노출 켠 것)를 그대로 읽어 보여준다.
   그래서 패키지를 추가·수정하면 다음에 열 때 자동으로 최신이다(다시 만들 필요 없음).
   세일즈북 발표 중 어느 장에서든 열고 닫으면 보던 장으로 돌아간다(포털 · 세일즈북 위 z).
   패키지 6개까지는 카드, 7개부터는 표(한 줄에 한 패키지 · 태블릿 한 화면에 12~15개 · 나란히 비교) — 대표 결정.
   표에선 '회차 순'으로 바꿔 볼 수 있다(많이 할수록 회당이 싸지는 게 숫자로 보이게). 기본은 설정의 표시 순서.
   ========================================================================= */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { won, wonApprox } from "@/lib/format";
import BrandMark from "@/components/ui/BrandMark";

const perSession = (p) => (p?.sessions ? Math.round(p.price / p.sessions) : null);
const TABLE_FROM = 7;

const samePkg = (a, b) => Boolean(a && b) && (a.id && b.id ? a.id === b.id : a.name === b.name && Number(a.sessions) === Number(b.sessions));

export default function PriceSheet({ packages = [], recommended = null, trainerName, onClose }) {
  // 가격표가 떠 있는 동안 ESC·화살표는 가격표 몫 — 아래 세일즈북이 닫히거나 장이 넘어가지 않게(캡처 단계에서 가로챔).
  useEffect(() => {
    const h = (e) => {
      if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const [bySessions, setBySessions] = useState(false);
  if (typeof document === "undefined") return null;
  const list = (packages || []).filter(Boolean);
  const table = list.length >= TABLE_FROM;
  // 추천 표시는 원래 순서(index) 기준이라 정렬해도 원래 번호를 들고 다닌다.
  const rows = list.map((pk, i) => ({ p: pk, i }));
  if (table && bySessions) rows.sort((a, b) => (a.p.sessions ?? Infinity) - (b.p.sessions ?? Infinity) || a.p.price - b.p.price);
  const anyList = list.some((pk) => pk.list_price != null && pk.list_price > pk.price);
  const pers = list.map(perSession).filter((v) => v != null);
  const cheapest = pers.length > 1 ? Math.min(...pers) : null;
  const today = new Date();

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgb(19_21_27/0.82)] p-3 backdrop-blur-sm sm:p-6 print:hidden" role="dialog" aria-modal="true" aria-label="PT 가격표" onClick={onClose}>
      <div className="relative flex max-h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <p className="m-0 text-[clamp(18px,2.4vw,24px)] font-extrabold tracking-[-0.02em] text-ink">PT 가격표</p>
              {trainerName && <p className="m-0 truncate text-[12px] text-muted">{trainerName} 트레이너</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {table && (
              <button type="button" onClick={() => setBySessions((v) => !v)} aria-pressed={bySessions}
                className={`min-h-[36px] rounded-full border px-3 text-[12px] font-semibold transition ${bySessions ? "border-ink bg-ink text-white" : "border-line text-sub hover:text-ink"}`}>
                회차 순
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="가격표 닫기" className="rounded-lg p-2 text-muted transition hover:bg-elevate hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          {table ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line-strong text-[12px] text-muted">
                  <th className="py-2 pr-3 font-semibold">패키지</th>
                  <th className="hidden py-2 pr-3 font-semibold sm:table-cell">회차 · 기간</th>
                  {anyList && <th className="hidden py-2 pr-3 text-right font-semibold md:table-cell">정가</th>}
                  <th className="py-2 pr-3 text-right font-semibold">가격</th>
                  <th className="py-2 text-right font-semibold">회당</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p: pk, i }) => {
                  const per = perSession(pk);
                  const rec = samePkg(recommended, pk);
                  const low = cheapest != null && per === cheapest;
                  const disc = pk.list_price != null && pk.list_price > pk.price;
                  return (
                    <tr key={pk.id || i} className={`border-b border-line ${rec ? "bg-primary-soft" : ""}`}>
                      <td className="py-2 pr-3 align-middle">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[clamp(14px,1.7vw,16px)] font-bold text-ink">{pk.name}</span>
                          {rec && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">추천</span>}
                          {low && <span className="rounded-full border border-primary/40 bg-card px-1.5 py-0.5 text-[10px] font-bold text-primary-strong">회당 최저</span>}
                        </span>
                        {/* 폰: 회차·기간 칸이 없어서 이름 아래로 */}
                        <span className="block text-[12px] text-muted sm:hidden">{[pk.sessions ? `${pk.sessions}회` : "기간제", pk.duration_label].filter(Boolean).join(" · ")}</span>
                        {pk.note && <span className="hidden text-[12px] text-muted sm:block">{pk.note}</span>}
                      </td>
                      <td className="hidden py-2 pr-3 align-middle text-[13px] text-sub sm:table-cell">{[pk.sessions ? `${pk.sessions}회` : "기간제", pk.duration_label].filter(Boolean).join(" · ")}</td>
                      {anyList && (
                        <td className="hidden py-2 pr-3 text-right align-middle text-[13px] text-muted md:table-cell">
                          {disc ? <><span className="line-through">{won(pk.list_price)}</span> <b className="font-bold text-primary-strong">{Math.round((1 - pk.price / pk.list_price) * 100)}%</b></> : ""}
                        </td>
                      )}
                      <td className="py-2 pr-3 text-right align-middle font-mono text-[clamp(15px,1.9vw,18px)] font-extrabold text-ink">{won(pk.price)}</td>
                      <td className={`py-2 text-right align-middle text-[13px] font-semibold ${low ? "text-primary-strong" : "text-sub"}`}>{per != null ? `약 ${wonApprox(per)}` : "기간제"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-sub">등록된 패키지가 없어요. 설정 › 가격표에서 패키지를 등록하면 가격표가 만들어져요.</p>
          ) : (
            <ul className={`m-0 grid list-none gap-3 p-0 ${list.length === 1 ? "mx-auto max-w-md" : list.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {list.map((p, i) => {
                const per = perSession(p);
                const rec = samePkg(recommended, p);
                const discounted = p.list_price != null && p.list_price > p.price;
                return (
                  <li key={p.id || i} className={`relative flex flex-col rounded-2xl border p-4 sm:p-5 ${rec ? "border-primary bg-primary-soft" : "border-line bg-elevate"}`}>
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      {rec && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">추천</span>}
                      {cheapest != null && per === cheapest && <span className="rounded-full border border-primary/40 bg-card px-2 py-0.5 text-[11px] font-bold text-primary-strong">회당 최저</span>}
                    </div>
                    <p className="m-0 text-[clamp(17px,2vw,20px)] font-extrabold text-ink">{p.name}</p>
                    <p className="m-0 mt-0.5 text-[13px] text-sub">
                      {[p.sessions ? `${p.sessions}회` : "기간제", p.duration_label].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-3">
                      {discounted && (
                        <p className="m-0 text-[13px] text-muted">
                          <span className="line-through">{won(p.list_price)}</span>
                          <span className="ml-1.5 font-bold text-primary-strong">{Math.round((1 - p.price / p.list_price) * 100)}% 할인</span>
                        </p>
                      )}
                      <p className="m-0 font-mono text-[clamp(26px,3.4vw,34px)] font-extrabold tracking-[-0.02em] text-ink">{won(p.price)}</p>
                      {per != null && <p className="m-0 text-[13px] font-semibold text-sub">회당 약 {wonApprox(per)}</p>}
                    </div>
                    {p.note && <p className="m-0 mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-sub">{p.note}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="m-0 mt-4 text-right text-[11px] text-muted">{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 기준</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

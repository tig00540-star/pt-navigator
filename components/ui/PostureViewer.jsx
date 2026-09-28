"use client";

/* =========================================================================
   PostureViewer — 체형 사진 전체화면 뷰어(회원에게 보여주는 화면).

   ── 왜 따로 만들었나 ──
   기존 ImageLightbox는 원본만 띄워서, 확대하면 기준선(그리드)이 사라졌다.
   정렬이 어긋난 걸 보여주는 게 이 사진의 목적인데 확대하면 근거가 없어지는 셈이다.

   ── 그리드가 사진에 정확히 겹쳐야 한다 ──
   object-contain은 화면 비율에 따라 위아래(또는 좌우)에 여백을 만든다. 그리드를 화면 전체에
   그리면 사진 밖에도 선이 그어져 기준선이 틀어져 보인다. 그래서 이미지 크기에 맞춰 줄어드는
   래퍼(inline-block) 안에 이미지와 그리드를 같이 넣어, 선이 항상 사진 위에만 놓이게 한다.

   ── 회원 앞에서 쓰는 화면 ──
   정면·측면·후면을 좌우로 넘기고, 그리드는 끌 수 있다(사진 원본도 봐야 할 때가 있다).
   ========================================================================= */

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";

/* 사진 위 기준선 — 세로 중심선(플럼라인)은 브랜드색, 나머지는 흰 선.
   썸네일과 전체화면이 같은 선을 써야 "아까 본 그 선"으로 읽힌다. */
export function PostureGridLines({ strong = false }) {
  const w = strong ? "w-[2px]" : "w-px";
  const h = strong ? "h-[2px]" : "h-px";
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={`absolute left-1/2 top-0 h-full ${w} -translate-x-1/2 bg-primary/70`} />
      <div className="absolute left-1/3 top-0 h-full w-px bg-white/45" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-white/45" />
      <div className="absolute left-0 top-1/4 w-full h-px bg-white/45" />
      <div className={`absolute left-0 top-1/2 w-full ${h} bg-primary/45`} />
      <div className="absolute left-0 top-3/4 w-full h-px bg-white/45" />
    </div>
  );
}

export default function PostureViewer({ shots = [], startIndex = 0, onClose }) {
  const [i, setI] = useState(startIndex);
  const [grid, setGrid] = useState(true);

  // startIndex는 열릴 때 한 번만 쓴다 — 이 컴포넌트는 열 때마다 새로 마운트된다(조건부 렌더).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight") setI((v) => (v + 1) % shots.length);
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + shots.length) % shots.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shots.length, onClose]);

  if (!shots.length) return null;
  const cur = shots[Math.min(i, shots.length - 1)];
  const many = shots.length > 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
      {/* 상단 — 어느 각도인지 + 그리드 토글 + 닫기 */}
      <div className="flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3">
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-bold text-white">{cur.label}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGrid((v) => !v)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold transition ${
              grid ? "bg-primary text-white" : "bg-white/10 text-white/80"
            }`}
          >
            <Grid3x3 className="h-4 w-4" /> 기준선
          </button>
          <button onClick={onClose} aria-label="닫기" className="min-h-[40px] rounded-lg px-2 text-white/80 transition hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* 사진 + 기준선 — 래퍼가 이미지 크기로 줄어들어 선이 사진 밖으로 안 나간다. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
        <div className="relative inline-block max-h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.url} alt={`체형 사진 ${cur.label}`} className="block max-h-[calc(100dvh-180px)] max-w-full rounded-lg object-contain" />
          {grid && <PostureGridLines strong />}
        </div>
      </div>

      {/* 하단 — 각도 전환. 회원에게 폰을 건넨 상태에서도 엄지로 닿는 자리. */}
      {many && (
        <div className="flex items-center justify-center gap-3 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            onClick={() => setI((v) => (v - 1 + shots.length) % shots.length)}
            aria-label="이전 사진"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex gap-1.5">
            {shots.map((s, idx) => (
              <button
                key={s.url}
                onClick={() => setI(idx)}
                aria-label={s.label}
                className={`h-2.5 rounded-full transition-all ${idx === i ? "w-6 bg-primary" : "w-2.5 bg-white/35"}`}
              />
            ))}
          </div>
          <button
            onClick={() => setI((v) => (v + 1) % shots.length)}
            aria-label="다음 사진"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}

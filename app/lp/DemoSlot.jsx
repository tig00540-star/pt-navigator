"use client";

/* 실제 화면 데모(자체완결 HTML)를 iframe으로 격리 임베드하는 슬롯.
   데모는 고정 크기(예: 폰 392×840)로 렌더되고, 이 컴포넌트가 컨테이너 폭에 맞춰
   transform:scale()로 축소한다 — 종횡비 유지(스펙 §4/§7). 레이아웃 유발 없음(transform만).

   - src 있으면 iframe(제목 필수·loading=lazy·테두리 0·투명 배경).
   - src 없으면 placeholder(아직 못 받은 데모 자리 · §4 지침).
   - w/h = 데모의 네이티브 픽셀 크기. box 높이는 h*scale로 세팅해 세로 공간을 정확히 차지. */

import { useEffect, useRef, useState } from "react";

export default function DemoSlot({
  src,
  title,
  w,
  h,
  placeholderTitle,
  placeholderNote,
}) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !w) return;
    const fit = () => setScale(Math.min(1, box.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    // 백업 — 방향전환·늦은 레이아웃 등 RO가 놓치는 경우까지 컨테이너 폭에 맞춘다.
    window.addEventListener("resize", fit);
    const raf = requestAnimationFrame(fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      cancelAnimationFrame(raf);
    };
  }, [w]);

  return (
    <div
      ref={boxRef}
      className="relative w-full"
      style={{ height: Math.round(h * scale) }}
    >
      <div
        className="absolute left-1/2 top-0"
        style={{
          width: w,
          height: h,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {src ? (
          <iframe
            src={src}
            title={title}
            loading="lazy"
            className="block border-0 bg-transparent"
            style={{ width: w, height: h }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-card p-5 text-center">
            <p className="text-[14.5px] font-bold text-ink">{placeholderTitle}</p>
            {placeholderNote && (
              <p className="font-mono text-[12px] text-muted">{placeholderNote}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/* 손가락 서명 칸(2026-10-06 · 운동일지 확인) — 캔버스에 그리고, 비어 있지 않으면 onChange(PNG data URL)로 알린다.
   · 화면 밀도(devicePixelRatio)에 맞춰 선명하게 · 그리는 동안 페이지가 스크롤되지 않게(touch-action none).
   · 저장 크기는 가로 600px 안쪽으로 줄여 보낸다(서명 한 장 수십 KB). '다시 쓰기'로 지움.
   · 숨겨진 채로 처음 그려지면 폭이 0이라 그려지지 않는다 → 크기가 바뀌면(보이게 될 때) · 첫 터치 때 다시 맞춘다. */

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

function fitCanvas(c, height) {
  if (!c) return;
  const w = c.clientWidth;
  if (!w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr); c.height = Math.round(height * dpr);
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#13151b";
  c.dataset.fit = "1";   // 크기를 맞췄음(안 맞췄으면 캔버스 기본 300×150 그대로라 좌표가 어긋난다)
}

export default function SignaturePad({ onChange, height = 160 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const drawn = useRef(false);   // 한 획이라도 그렸나(크기 다시 맞출 때 서명을 지우지 않게)
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    fitCanvas(c, height);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (!drawn.current) fitCanvas(c, height); }) : null;
    ro?.observe(c);
    return () => ro?.disconnect();
  }, [height]);

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => {
    e.preventDefault();
    if (!ref.current.dataset.fit) fitCanvas(ref.current, height);
    try { ref.current.setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트 등 · 그리기는 계속 */ }
    drawing.current = true; last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e), ctx = ref.current.getContext("2d");
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    drawn.current = true;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!drawn.current) return;
    // 보낼 그림 — 흰 바탕 PNG · 가로 600px 안쪽
    const c = ref.current;
    if (!c.width || !c.height) return;
    const scale = Math.min(1, 600 / c.width);
    const out = document.createElement("canvas");
    out.width = Math.round(c.width * scale); out.height = Math.round(c.height * scale);
    const o = out.getContext("2d");
    o.fillStyle = "#ffffff"; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(c, 0, 0, out.width, out.height);
    onChange?.(out.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    drawn.current = false;
    setEmpty(true); onChange?.(null);
  };

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-line-strong bg-white">
        <canvas ref={ref} style={{ height, touchAction: "none" }} className="block w-full cursor-crosshair rounded-xl"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="서명 칸 · 손가락으로 서명해 주세요" role="img" />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[16px] text-muted">여기에 손가락으로 서명해 주세요</span>}
      </div>
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={clear} disabled={empty} className="inline-flex min-h-[36px] items-center gap-1 px-1 text-[14px] font-semibold text-sub disabled:opacity-30">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> 다시 쓰기
        </button>
      </div>
    </div>
  );
}

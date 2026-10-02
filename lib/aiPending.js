"use client";

/* =========================================================================
   aiPending — AI 리포트 '만드는 중' 기억 + 돌아왔을 때 이어 받기(2026-10-02).

   생성은 서버(app/api/ot-brief)가 끝까지 돌리고 결과도 서버가 저장한다(after() · 브라우저가 끊겨도).
   화면은 시작 시각만 이 브라우저에 적어 두고(localStorage), 다른 화면에 갔다 오거나 창을 다시 열면
   저장된 결과가 생길 때까지 몇 초마다 확인한다. 4분이 지나면 포기(서버 제한 3분 + 여유).
   localStorage가 막힌 환경(사생활 보호 모드 등)에선 조용히 아무것도 안 한다 — 그래도 서버 저장은 된다.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";

const PREFIX = "ai-pending:";
const TTL_MS = 4 * 60 * 1000;

export function markPending(key) {
  try { localStorage.setItem(PREFIX + key, String(Date.now())); } catch {}
}
export function clearPending(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}
export function pendingSince(key) {
  try {
    const v = Number(localStorage.getItem(PREFIX + key));
    if (!v) return null;
    if (Date.now() - v > TTL_MS) { localStorage.removeItem(PREFIX + key); return null; }
    return v;
  } catch {
    return null;
  }
}

// 저장된 결과의 생성 시각이 '시작 시각 이후'인가(같은 칸의 옛 결과와 구분 · 시계 오차 30초 허용).
export const isNewerThan = (iso, since) => Boolean(iso) && new Date(iso).getTime() >= since - 30000;

/**
 * 돌아왔을 때 이어 받기. key가 '만드는 중'이면 fetchResult(since)를 4초마다 불러,
 * 결과가 생기면 onFound(result) 후 종료. 반환값 = 지금 기다리는 중인지.
 */
export function usePendingResult(key, fetchResult, onFound) {
  const [waiting, setWaiting] = useState(false);
  const fetchRef = useRef(fetchResult);
  const foundRef = useRef(onFound);
  useEffect(() => { fetchRef.current = fetchResult; foundRef.current = onFound; });

  useEffect(() => {
    if (!key) return undefined;
    let stop = false;
    (async () => {
      const since = pendingSince(key);
      if (!since) return;
      setWaiting(true);
      while (!stop) {
        // 확인 '전에' 표시를 읽는다 — 원래 화면이 응답을 받고 표시를 지운 직후에도 저장된 결과를 한 번 더 확인하게.
        const still = pendingSince(key);
        try {
          const r = await fetchRef.current(since);
          if (stop) return;
          if (r) { clearPending(key); foundRef.current(r); break; }
        } catch {
          // 조회 실패는 다음 차례에 다시
        }
        if (!still) break;
        await new Promise((res) => setTimeout(res, 4000));
      }
      if (!stop) setWaiting(false);
    })();
    return () => { stop = true; };
  }, [key]);

  return waiting;
}

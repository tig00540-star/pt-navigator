"use client";

/* 폰 홈 위젯 구성(2026-10-03 · 대표: "트레이너가 홈에 위젯을 넣고 뺄 수 있게").
   · 폰 홈(TrainerHub)에서만 편집 · 넓은 홈(WideHome)은 고정.
   · 저장 = 이 기기 localStorage(계정 저장 아님 · SQL 없음). 막힌 브라우저는 이번 세션 메모리로만.
   · 구성 = { tiles: [...], cards: [...] } — 바로가기 칸과 정보 카드를 따로 순서 매긴다.
   · '오늘' 카드는 고정(목록에 없음). 모르는 id는 버린다(위젯을 없애도 옛 저장값이 안 깨지게). */

import { useMemo, useSyncExternalStore } from "react";

export const TILE_IDS = ["ot", "pt", "salesbook", "stats", "schedule", "cases", "price", "add"];
export const CARD_IDS = ["ranking", "numbers", "regdue", "churn", "unconfirmed", "reapproach", "inbody"];
export const DEFAULT_LAYOUT = { tiles: ["ot", "pt", "salesbook", "stats"], cards: ["ranking"] };

const KEY = "ot.homeLayout.v1";
const listeners = new Set();
let memory = null; // localStorage가 막혔을 때

function read() {
  try { return localStorage.getItem(KEY); } catch { return memory; }
}
function subscribe(cb) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}

function parse(raw) {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const v = JSON.parse(raw);
    const clean = (arr, ok) => [...new Set((Array.isArray(arr) ? arr : []).filter((id) => ok.includes(id)))];
    return { tiles: clean(v.tiles, TILE_IDS), cards: clean(v.cards, CARD_IDS) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function useHomeLayout() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const layout = useMemo(() => parse(raw), [raw]);
  const save = (next) => {
    const s = next ? JSON.stringify(next) : null;
    try {
      if (s) localStorage.setItem(KEY, s); else localStorage.removeItem(KEY);
    } catch {
      memory = s;
    }
    listeners.forEach((f) => f());
  };
  return [layout, save];
}

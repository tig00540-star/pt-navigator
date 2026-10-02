"use client";

/* 넓은 화면(lg 1024px~)인지 — 폰/태블릿 세로와 태블릿 가로·PC에서 아예 다른 화면을 그릴 때(예: 홈).
   CSS로 숨기기만 하면 안 보이는 쪽도 데이터를 불러오므로, 한쪽만 그리도록 JS로 고른다.
   서버 렌더에선 false(폰 화면) → 브라우저에서 실제 폭으로 바로 맞춘다. */
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";
const subscribe = (cb) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getSnapshot = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : false);

export function useIsWide() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

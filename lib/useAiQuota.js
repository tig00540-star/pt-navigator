"use client";
// lib/useAiQuota.js — 클라이언트. 이번 달 AI 한도 · 남은 수(2026-10-07 요금제 개편).
//   숫자의 출처는 DB rpc my_ai_quota(센터는 계정 공용이라 트레이너도 같은 숫자) — 진짜 관문은 서버(402).
//   화면 여러 곳이 같이 써서 한 번만 읽고 나눠 쓴다. AI를 만든 뒤엔 refreshAiQuota()로 다시 읽는다.
//   읽기 실패(SQL 전 · 데모) = null → 화면은 아무것도 안 보여 준다(잠그지 않음).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const EVT = "ai-quota-changed";
let cache = null;
let inflight = null;

async function fetchQuota() {
  if (!supabase) return null;
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.rpc("my_ai_quota");
      if (error) { console.error("AI 한도 읽기 실패", error); return null; }
      cache = data || null;
      return cache;
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

export function refreshAiQuota() {
  cache = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}

// 베이직은 기능마다 따로, 프로 · 센터는 OT · 재등록이 '준비' 하나로 묶인다(DB ai_group_of와 같은 규칙).
export function groupOf(tier, kind) {
  return tier !== "basic" && (kind === "ot" || kind === "rereg") ? "prep" : kind;
}

export const KIND_LABEL = { voice: "음성일지", ot: "OT 준비", rereg: "재등록 준비", prep: "OT · 재등록 준비", inbody: "인바디 분석", roadmap: "로드맵 초안" };

/** @returns {{ q: object|null, tier: string|null, info: (kind:string) => ({ group, limit, extra, used, left }|null) }} */
export function useAiQuota() {
  const [q, setQ] = useState(cache);
  useEffect(() => {
    let alive = true;
    const load = () => fetchQuota().then((d) => { if (alive) setQ(d); });
    load();
    window.addEventListener(EVT, load);
    return () => { alive = false; window.removeEventListener(EVT, load); };
  }, []);
  const tier = q?.tier || null;
  const info = (kind) => {
    if (!q?.groups) return null;
    const g = groupOf(tier, kind);
    const v = q.groups[g];
    return v ? { group: g, ...v } : null;
  };
  return { q, tier, trial: Boolean(q?.trial), info };
}

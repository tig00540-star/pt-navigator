import { supabase } from "@/lib/supabaseClient";

/* center_machine 읽기 전용 공유 캐시 — 거의 안 변하는 설정 데이터.
   읽기 소비처(VoiceLogTab·PtWorkoutTab)가 마운트마다 각자 조회하던 걸 SPA 세션 1벌로.
   편집기 CenterMachineSettings는 직접 조회 유지 + save/remove 후 invalidate() 호출.
   RLS/account 스코프는 기존과 동일(select에 account 필터 없음 = DB DEFAULT+RLS 위임 유지). */
let cache = null; // Promise<rows[]> | null

export function loadCenterMachines() {
  if (!supabase) return Promise.resolve([]); // 데모: 빈 목록(= 기존 동작)
  if (!cache) {
    cache = supabase
      .from("center_machine")
      .select("*")
      .order("kind", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) { cache = null; return []; } // 실패 시 캐시 비워 다음 마운트 재시도
        return data || [];
      });
  }
  return cache;
}

export function invalidateCenterMachines() { cache = null; }

/* 계정 경계에서 캐시 폐기 — 모듈 캐시는 RLS 바깥이라, 로그아웃/재로그인 시 SPA가 리로드되지
   않으면 이전 계정 장비가 그대로 보인다(교차 계정 노출). 로그인·로그아웃 이벤트에만 반응
   (TOKEN_REFRESHED 등은 계정이 안 바뀌므로 불필요한 재조회 방지). */
if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") cache = null;
  });
}

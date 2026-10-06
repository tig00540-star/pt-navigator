// lib/useAccount.js — 클라이언트. 로그인 트레이너의 role + 소속 account.type 1회 조회.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// 설정에서 일하는 방식 · 상호를 바꾸면 이 이벤트로 열려 있는 화면들이 다시 읽는다.
export const ACCOUNT_CHANGED = "ot:account-changed";

export function useAccount() {
  const [state, setState] = useState({ loading: true, uid: null, role: null, name: null, accountType: null, accountName: null });
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const on = () => setRev((n) => n + 1);
    window.addEventListener(ACCOUNT_CHANGED, on);
    return () => window.removeEventListener(ACCOUNT_CHANGED, on);
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { if (alive) setState({ loading: false, uid: null, role: null, name: null, accountType: null, accountName: null }); return; }
      try {
        const { data: au } = await supabase.auth.getUser();
        const uid = au?.user?.id ?? null;
        if (!uid) { if (alive) setState({ loading: false, uid: null, role: null, name: null, accountType: null, accountName: null }); return; }
        // trainer 본인 행(RLS id=auth.uid()) + account 임베드(RLS id=auth_account_id()). FK trainer.account_id→account.id 존재.
        const { data } = await supabase
          .from("trainer")
          .select("role, name, account:account_id(type, name)")
          .eq("id", uid)
          .maybeSingle();
        if (!alive) return;
        // 개인 계정의 일하는 방식 · 상호(2026-10-06 · 2026-10-06-solo-mode.sql) — 따로 읽는다(SQL 전이면 열이 없어 실패 → 기본값).
        let extra = null;
        if (data?.account?.type === "solo") {
          const { data: a, error: aErr } = await supabase.from("account").select("work_mode, brand_name").maybeSingle();
          if (!aErr) extra = a;
        }
        if (!alive) return;
        setState({ loading: false, uid, role: data?.role ?? null, name: data?.name ?? null, accountType: data?.account?.type ?? null, accountName: data?.account?.name ?? null,
          workMode: extra?.work_mode ?? null, brandName: extra?.brand_name ?? null });
      } catch {
        // 네트워크/조회 실패 → 로딩 해제 + 안전측(solo/center/owner 전부 false = 권한 UI fail-closed).
        if (alive) setState({ loading: false, uid: null, role: null, name: null, accountType: null, accountName: null });
      }
    })();
    return () => { alive = false; };
  }, [rev]);
  const isSolo = state.accountType === "solo";
  const isCenter = state.accountType === "center";
  const isOwner = state.role === "owner";
  // 개인 계정: 센터 소속(급여 · 수수료 · 기본) | 프리랜서(회원비 직접 · 장부). 센터 계정은 둘 다 false.
  const isFreelance = isSolo && state.workMode === "freelance";
  const isEmployedSolo = isSolo && !isFreelance;
  return { ...state, isSolo, isCenter, isOwner, isFreelance, isEmployedSolo, trainerName: state.name };
}

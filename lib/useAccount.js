// lib/useAccount.js — 클라이언트. 로그인 트레이너의 role + 소속 account.type 1회 조회.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useAccount() {
  const [state, setState] = useState({ loading: true, uid: null, role: null, name: null, accountType: null, accountName: null });
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
        setState({ loading: false, uid, role: data?.role ?? null, name: data?.name ?? null, accountType: data?.account?.type ?? null, accountName: data?.account?.name ?? null });
      } catch {
        // 네트워크/조회 실패 → 로딩 해제 + 안전측(solo/center/owner 전부 false = 권한 UI fail-closed).
        if (alive) setState({ loading: false, uid: null, role: null, name: null, accountType: null, accountName: null });
      }
    })();
    return () => { alive = false; };
  }, []);
  const isSolo = state.accountType === "solo";
  const isCenter = state.accountType === "center";
  const isOwner = state.role === "owner";
  return { ...state, isSolo, isCenter, isOwner, trainerName: state.name };
}

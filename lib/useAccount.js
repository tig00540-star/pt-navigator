// lib/useAccount.js — 클라이언트. 로그인 트레이너의 role + 소속 account.type 1회 조회.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useAccount() {
  const [state, setState] = useState({ loading: true, uid: null, role: null, accountType: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { if (alive) setState({ loading: false, uid: null, role: null, accountType: null }); return; }
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      if (!uid) { if (alive) setState({ loading: false, uid: null, role: null, accountType: null }); return; }
      // trainer 본인 행(RLS id=auth.uid()) + account 임베드(RLS id=auth_account_id()). FK trainer.account_id→account.id 존재.
      const { data } = await supabase
        .from("trainer")
        .select("role, account:account_id(type)")
        .eq("id", uid)
        .maybeSingle();
      if (!alive) return;
      setState({ loading: false, uid, role: data?.role ?? null, accountType: data?.account?.type ?? null });
    })();
    return () => { alive = false; };
  }, []);
  const isSolo = state.accountType === "solo";
  const isOwner = state.role === "owner";
  return { ...state, isSolo, isOwner };
}

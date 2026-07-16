// lib/memberSupabase.js — 회원 앱(/m) 전용 Supabase 클라. 트레이너 세션과 저장소 분리.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// storageKey 분리 → 같은 브라우저에서 트레이너 세션과 충돌 안 함. 세션 지속+자동갱신(재방문 유지).
export const memberSupabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storageKey: "pt-member-auth",
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

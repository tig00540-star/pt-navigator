// lib/authHeader.js — 클라이언트. AI 라우트 fetch에 Bearer 토큰을 실어준다.
import { supabase } from "@/lib/supabaseClient";

/** 현재 세션의 Authorization 헤더. 데모 모드(supabase null)면 빈 객체(라우트도 인증 스킵). */
export async function authHeader() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

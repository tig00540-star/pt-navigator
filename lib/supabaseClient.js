// lib/supabaseClient.js
// -----------------------------------------------------------------------------
// Supabase 클라이언트. 환경변수(.env.local)에서 URL/KEY를 읽어옵니다.
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
// 키가 아직 설정되지 않았으면 null을 반환해, 앱이 데모 데이터로 계속 뜨게 합니다.
// -----------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;

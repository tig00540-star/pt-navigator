"use client";
/* 트레이너 '내 소개'를 화면 모양으로(클라이언트 · 2026-10-11) — 세일즈북 2번째 장 · 설정 미리 보기.
   profile = 본인 trainer_profile 행(세일즈북은 useSalesbookAssets가 이미 읽어 옴). 밖(QR 페이지)은 서버 lib/trainerIntro가 같은 모양을 만든다.
   보여 주는 사례 = intro_cases 순서 · 사진 · 후기는 '동의받았어요' 체크한 것만. 소개가 비었으면 null(장이 안 생김). */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PHOTO_URL_TTL } from "@/lib/photoUrl";
import { signCaseUrls } from "@/components/salesbook/caseData";
import { INTRO_MAX_CASES, needsConsent } from "@/lib/trainerIntro";

export function introHasContent(p) {
  if (!p) return false;
  return !!(p.intro || (Array.isArray(p.tags) && p.tags.length) || (Array.isArray(p.intro_cases) && p.intro_cases.length) || p.photo_path);
}

export default function useTrainerIntro(profile, fallbackName = "") {
  const has = introHasContent(profile);
  const key = has ? JSON.stringify([profile.intro, profile.tags, profile.intro_cases, profile.photo_path, profile.display_name, profile.credentials, fallbackName]) : "";
  const [state, setState] = useState({ key: "", intro: null });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      const p = profile;
      const ids = (Array.isArray(p.intro_cases) ? p.intro_cases : []).slice(0, INTRO_MAX_CASES);
      let cases = [];
      let urls = {};
      let photo = null;
      try {
        if (supabase && ids.length) {
          const { data } = await supabase.from("sales_case").select("*").in("id", ids);
          cases = ids.map((id) => (data || []).find((r) => r.id === id))
            .filter((c) => c && c.kind !== "care" && c.trainer_id === p.trainer_id && (!needsConsent(c) || c.consent_confirmed_at));
          urls = await signCaseUrls(cases);
        }
        if (supabase && p.photo_path) {
          const { data } = await supabase.storage.from("sales-cases").createSignedUrl(p.photo_path, PHOTO_URL_TTL);
          photo = data?.signedUrl || null;
        }
      } catch (e) { console.error("내 소개 사례 읽기 실패", e); }
      if (cancelled) return;
      setState({
        key,
        intro: {
          name: p.display_name || fallbackName || "",
          credentials: p.credentials || "",
          intro: p.intro || "",
          tags: (Array.isArray(p.tags) ? p.tags : []).filter(Boolean).slice(0, 5),
          photo,
          cases: cases.map((c) => ({ id: c.id, kind: c.kind, label: c.label, note: c.note, data: c.data || {} })),
          urls,
        },
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key가 profile의 쓰는 칸을 다 담는다
  }, [key]);
  return key && state.key === key ? state.intro : null;
}

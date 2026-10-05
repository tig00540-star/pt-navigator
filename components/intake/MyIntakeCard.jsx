"use client";

/* 트레이너 설정 '내 OT 신청 QR'(2026-10-06) — 회원이 찍거나 링크를 누르면 OT 신청서가 열리고,
   제출하면 나의 OT 회원으로 바로 등록된다('오늘' 탭에 '새 OT 회원' 알림). */

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import IntakeQr from "@/components/intake/IntakeQr";

export default function MyIntakeCard() {
  const [uid, setUid] = useState(null);
  const { toast, showToast } = useToast();
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = (await supabase?.auth.getUser()) || {};
      if (alive) setUid(data?.user?.id || "");
    })();
    return () => { alive = false; };
  }, []);
  if (!supabase || uid === "") return null;
  return (
    <Card>
      <SectionTitle icon={QrCode}>내 OT 신청 QR</SectionTitle>
      <p className="m-0 mb-3 text-[13.5px] leading-relaxed text-sub">
        앞에 있는 회원은 <b className="font-semibold text-ink">QR 보기</b>로 찍게 하고, 멀리 있는 회원에겐 <b className="font-semibold text-ink">링크 복사</b>로 카톡을 보내세요.
        회원이 사전 문진 · 원하는 요일 · 시간을 남기면 내 OT 회원으로 바로 등록돼요.
      </p>
      {uid ? <IntakeQr trainerId={uid} showToast={showToast} /> : <p className="m-0 text-[13px] text-muted">불러오는 중이에요</p>}
      <Toast message={toast} />
    </Card>
  );
}

"use client";

/* 설정 › 내 정보 '개인 계정으로 이어 쓰기'(2026-10-07 · 계획서 3단계 · 센터 소속 트레이너만).
   대표가 허락했으면(rpc my_leave_allow) 눈에 띄게 — '회원과 함께'면 담당 회원 수까지.
   허락이 없으면 작은 글자 한 줄(회원 없이 · 같은 로그인으로 혼자 쓰기). 누르면 /leave-center. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAccount } from "@/lib/useAccount";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const day = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

export default function LeaveCenterCard() {
  const acc = useAccount();
  const [allow, setAllow] = useState(undefined);
  const staff = !acc.loading && acc.isCenter && acc.role === "trainer";

  useEffect(() => {
    if (!staff || !supabase) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc("my_leave_allow");
      if (!alive) return;
      if (error) console.error("독립 허락 확인 실패", error);   // 함수가 아직 없으면(SQL 전) 허락 없음으로
      setAllow(error ? null : data || null);
    })();
    return () => { alive = false; };
  }, [staff]);

  if (!staff || allow === undefined) return null;

  if (!allow) {
    return (
      <p className="m-0 px-1 text-[13px] leading-relaxed text-muted">
        센터를 떠나도 같은 로그인으로 혼자 쓸 수 있어요(회원 없이).{" "}
        <Link href="/leave-center" className="font-semibold text-sub underline underline-offset-2">개인 계정으로 이어 쓰기</Link>
      </p>
    );
  }
  return (
    <Card padding="lg">
      <SectionTitle icon={DoorOpen}>개인 계정으로 이어 쓰기</SectionTitle>
      <p className="m-0 text-[14px] leading-relaxed text-sub">
        {allow.center_name} 대표가 {allow.with_members ? <b className="text-ink">회원과 함께</b> : "회원 없이"} 독립을 허락했어요({day(allow.expires_at)}까지).
        {allow.with_members ? ` 담당 회원 ${allow.members}명에게 기록을 함께 옮길지 물을 수 있어요.` : ""} 같은 로그인으로 내 개인 계정이 돼요.
      </p>
      <Link href="/leave-center" className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-bold text-white no-underline">
        개인 계정으로 이어 쓰기
      </Link>
    </Card>
  );
}

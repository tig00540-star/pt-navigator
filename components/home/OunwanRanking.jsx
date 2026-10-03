"use client";

/* 오운완 랭킹 — 홈 카드 하나(폰 TrainerHub 위젯 · 넓은 홈 '회원 쪽 소식' 칸).
   2026-10-03 합침(대표): 홈 '이번 달 출석 랭킹'과 내 실적 '오운완 랭킹'이 같은 데이터라 홈 하나로. 내 실적에서는 뺐다.
   이름은 '출석'이 아니라 '오운완' — PT 수업만이 아니라 회원이 유산소 · 개인운동을 기록한 날도 센다.
   기준 = rpc ounwan_ranking(서버 집계 · 1000행 잘림 무관): 이번 달(month_count · 날 수) | 연속일(streak).
   내 담당만(직접 맡은 회원이 없는 대표는 센터 전체 · 홈과 같은 규칙) · 0은 뺀다 · 상위 5명 + 더 보기(10명).
   데모(키 없음) · 0건이면 숨김.
   ⚠️ 트레이너 전용 — 회원 전용 페이지엔 노출 금지(하위권 사기저하). 회원은 자기 진행률만 본다. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Flame } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor } from "@/lib/memberStatus";
import { hrefForMember } from "@/lib/nav";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const TOP = 5;
const MAX = 10;
// 기준 — 정적 맵(purge-safe · 동적 조립 금지). 순수 횟수는 자주 오는 회원이 유리해서 연속일 보기를 함께 둔다.
const MODES = {
  month: { label: "이번 달", key: "month_count" },
  streak: { label: "연속일", key: "streak" },
};

export default function OunwanRanking({ members = [], uid }) {
  const [rows, setRows] = useState(null);
  const [mode, setMode] = useState("month");
  const [more, setMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.rpc("ounwan_ranking");
        if (error) console.error("오운완 랭킹 조회 실패", error);
        if (!cancelled) setRows(data || []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ranked = useMemo(() => {
    const centerWide = Boolean(uid) && members.length > 0 && !members.some((m) => m.trainer_id === uid);
    const scoped = uid && !centerWide ? members.filter((m) => m.trainer_id === uid) : members;
    const byId = new Map(scoped.filter((m) => !m.hidden).map((m) => [m.id, m]));
    const k = MODES[mode].key;
    const other = mode === "month" ? "streak" : "month_count"; // 같으면 다른 기준으로 줄 세움
    return (rows || [])
      .map((r) => ({ ...r, member: byId.get(r.user_id) }))
      .filter((r) => r.member && (r[k] ?? 0) > 0)
      .sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0) || (b[other] ?? 0) - (a[other] ?? 0))
      .slice(0, MAX);
  }, [rows, members, uid, mode]);

  if (!supabase || !rows) return null;
  // 이번 달 기준으로 아무도 없으면 카드를 숨긴다(연속일로 바꿨을 때 비면 안내만).
  const anyThisMonth = (rows || []).some((r) => (r.month_count ?? 0) > 0);
  if (!anyThisMonth && mode === "month") return null;
  const list = more ? ranked : ranked.slice(0, TOP);
  const k = MODES[mode].key;
  const pill = (on) => (on
    ? "inline-flex min-h-[32px] items-center rounded-full bg-card px-3 text-[13px] font-semibold text-ink shadow-sm"
    : "inline-flex min-h-[32px] items-center rounded-full px-3 text-[13px] text-sub hover:text-ink");

  return (
    <Card as="section" padding="none">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <SectionTitle icon={Flame} className="mb-0">오운완 랭킹</SectionTitle>
        <div className="flex shrink-0 gap-1 rounded-full bg-elevate p-[3px]" role="tablist" aria-label="랭킹 기준">
          <button type="button" role="tab" aria-selected={mode === "month"} onClick={() => setMode("month")} className={pill(mode === "month")}>{MODES.month.label}</button>
          <button type="button" role="tab" aria-selected={mode === "streak"} onClick={() => setMode("streak")} className={pill(mode === "streak")}>{MODES.streak.label}</button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[13px] text-muted">아직 이어서 기록한 회원이 없어요.</p>
      ) : (
        <ol className="m-0 list-none divide-y divide-line border-t border-line p-0">
          {list.map((r, i) => (
            <li key={r.user_id}>
              <Link href={hrefForMember(r.user_id, viewFor(r.member))}
                className="flex min-h-[48px] items-center gap-3 px-4 py-2.5 no-underline transition hover:bg-elevate">
                <span className={`w-5 shrink-0 text-center text-[14px] font-bold ${i < 3 ? "text-primary-strong" : "text-muted"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{r.member.name}</span>
                {mode === "month" && (r.streak ?? 0) >= 3 && <span className="shrink-0 text-[12px] text-muted">{r.streak}일 연속</span>}
                <span className="shrink-0 text-[15px] font-bold text-ink">{r[k]}<span className="ml-0.5 text-[12px] font-medium text-muted">일</span></span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {ranked.length > TOP && (
        <button type="button" onClick={() => setMore((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-center gap-1 border-t border-line text-[13px] font-semibold text-sub hover:text-ink">
          {more ? "접기" : `더 보기 · ${ranked.length}명`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">오운완 = 유산소 · 개인운동 · PT 중 하나라도 기록된 날</p>
    </Card>
  );
}

"use client";

/* 처음 시작하기 체크리스트(2026-10-12 · docs/v2-계획-처음시작-회원일괄등록.md 5장) — 홈 맨 위.
   ■ 지금 기록을 읽어 끝난 줄을 자동으로 지운다(직접 체크 없음 · 새 저장 없음).
   ■ 계정 종류별 줄: 센터 소속 트레이너 · 개인(+ 프리랜서) · 센터 대표.
   ■ '첫 주'는 '첫날 10분'을 다 끝내면 펼쳐짐 · '나중에 하기' = 한 줄로 접기(이 기기 기억 · 대표 결정).
   ■ 가입한 지 30일 안 아이디에만 보인다(쓰던 트레이너에게 갑자기 뜨지 않게) · 다 끝나면 하루 축하 한 줄 뒤 사라짐.
   ■ 표가 없거나 조회가 실패하면 그 줄은 '아직'으로 둔다(잠그지 않음). */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Rocket } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAccount } from "@/lib/useAccount";
import { pushState } from "@/lib/pushClient";

const COLLAPSE_KEY = "ot.startChecklist.collapsed";
const DONE_KEY = "ot.startChecklist.doneAt";
const NEW_DAYS = 30;

const ITEMS = {
  push:     { label: "앱 설치 · 폰 알림 켜기", href: "/settings/notify" },
  workMode: { label: "일하는 방식 · 상호", href: "/settings/me" },
  pkg:      { label: "PT 가격표 등록", href: "/settings/money", ai: true },
  profile:  { label: "내 소개 (이름 · 사진 · 한 줄)", href: "/settings/me" },
  members:  { label: "기존 회원 옮겨 오기", sub: "여러 명 한꺼번에 · 남은 수업까지", href: "/members/import" },
  assign:   { label: "회원 옮겨 오기 · 트레이너 배정", sub: "여러 명 한꺼번에 · 담당까지", href: "/members/import" },
  log:      { label: "첫 운동일지 말로 남기기", href: "/members/pt" },
  link:     { label: "회원에게 회원 전용 페이지 링크 보내기", sub: "운동일지를 저장하면 안내가 떠요", href: "/members/pt" },
  goal:     { label: "회원 목표 · 첫 인바디", href: "/members/pt", ai: true },
  ot:       { label: "첫 OT 대본 만들어 보기", href: "/members/ot" },
  fav:      { label: "자주 쓰는 영상 별표", href: "/settings/library", ai: true },
  cases:    { label: "사례 담기 · 변화 모음집", href: "/salesbook/cases" },
  sign:     { label: "서명 남기기 · 신규 등록 혜택 장", href: "/settings/me" },
  sched:    { label: "고정 개인 일정 · 예약 받는 규칙", href: "/today" },
  machines: { label: "센터 장비 목록", href: "/settings/gear", ai: true },
  ledger:   { label: "장부 시작하기", href: "/stats" },
  trainers: { label: "트레이너 초대", href: "/admin?tab=ops" },
  scheme:   { label: "급여 규칙 정하기", href: "/admin?tab=payroll" },
  centerQr: { label: "센터 OT 신청 QR 걸기", href: "/admin?tab=flow" },
  settle:   { label: "정산 시작일 정하기", href: "/admin?tab=settle" },
  event:    { label: "첫 회원 이벤트 만들기", href: "/settings/reward" },
};

// 계정 종류별 줄 순서
function plan({ isOwner, isCenter, isSolo, isFreelance }) {
  if (isCenter && isOwner) return { day: ["trainers", "machines", "scheme", "centerQr", "assign"], week: ["push", "settle", "event", "profile"] };
  if (isSolo) return {
    day: ["push", "workMode", "pkg", "profile", "members", "log", "link"],
    week: ["machines", "goal", "ot", "fav", "cases", "sign", "sched", ...(isFreelance ? ["ledger"] : [])],
  };
  return { day: ["push", "pkg", "profile", "members", "log", "link"], week: ["goal", "ot", "fav", "cases", "sign", "sched"] };
}

const readLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 이번 화면만 */ } };

// head + count 조회 → 1건 이상이면 true · 실패하면 false
async function has(q) {
  try { const { count, error } = await q; return !error && (count || 0) > 0; } catch { return false; }
}

export default function StartChecklist({ members = [] }) {
  const acc = useAccount();
  const [factsRaw, setFacts] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [doneAt, setDoneAt] = useState(null);
  const memberKey = (members || []).filter((m) => m && !m.hidden).map((m) => m.id).sort().join(",");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readLS(COLLAPSE_KEY) === "1");
    setDoneAt(Number(readLS(DONE_KEY)) || null);
  }, []);

  useEffect(() => {
    if (acc.loading || !acc.uid || !supabase) return;
    let alive = true;
    (async () => {
      const uid = acc.uid;
      const { data: me } = await supabase.from("trainer").select("created_at").eq("id", uid).maybeSingle();
      const fresh = me?.created_at && new Date().getTime() - Date.parse(me.created_at) < NEW_DAYS * 86400000;
      if (!alive) return;
      setIsNew(Boolean(fresh));
      if (!fresh) return;
      const ids = memberKey ? memberKey.split(",").slice(0, 100) : [];
      const head = { count: "exact", head: true };
      const [push, pkg, prof, log, inbody, ot, fav, cases, ev, pref, machines, ledger1, ledger2, trainers, scheme, qr, event] = await Promise.all([
        pushState().then((s) => s === "on").catch(() => false),
        has(supabase.from("pt_package").select("id", head).eq("trainer_id", uid)),
        supabase.from("trainer_profile").select("display_name, intro, photo_path, signature_data_url, salesbook_benefits, showcase").eq("trainer_id", uid).maybeSingle().then((r) => r.data || null).catch(() => null),
        ids.length ? has(supabase.from("daily_workout_log").select("id", head).in("user_id", ids)) : false,
        has(supabase.from("inbody_log").select("id", head).eq("trainer_id", uid)),
        ids.length ? has(supabase.from("ot_log").select("id", head).in("user_id", ids).not("report", "is", null)) : false,
        has(supabase.from("library_item").select("id", head).eq("trainer_id", uid).eq("favorite", true)),
        has(supabase.from("sales_case").select("id", head).eq("trainer_id", uid)),
        has(supabase.from("trainer_event").select("id", head).eq("trainer_id", uid)),
        has(supabase.from("trainer_booking_pref").select("trainer_id", head).eq("trainer_id", uid)),
        has(supabase.from("center_machine").select("id", head)),
        acc.isFreelance ? has(supabase.from("income").select("id", head)) : false,
        acc.isFreelance ? has(supabase.from("expense").select("id", head)) : false,
        acc.isCenter && acc.isOwner ? has(supabase.from("trainer").select("id", head).neq("id", uid)) : false,
        acc.isCenter && acc.isOwner ? has(supabase.from("pay_scheme").select("id", head)) : false,
        acc.isCenter && acc.isOwner ? has(supabase.from("intake_link").select("id", head).is("trainer_id", null)) : false,
        has(supabase.from("member_event").select("id", head)),
      ]);
      let settle = false;
      if (acc.isCenter && acc.isOwner) {
        try { const { data } = await supabase.from("account").select("settlement_start_day").maybeSingle(); settle = data?.settlement_start_day != null; } catch { settle = false; }
      }
      if (!alive) return;
      setFacts({
        push, pkg,
        profile: Boolean(prof && (prof.display_name || prof.intro || prof.photo_path)),
        log, inbody, ot, fav,
        cases: cases || Boolean(prof?.showcase?.cases?.length),
        sign: Boolean(prof?.signature_data_url),
        sched: ev || pref,
        machines, ledger: ledger1 || ledger2,
        workMode: Boolean(acc.workMode || acc.brandName),
        trainers, scheme, centerQr: qr, settle, event,
      });
    })();
    return () => { alive = false; };
  }, [acc.loading, acc.uid, acc.isCenter, acc.isOwner, acc.isFreelance, acc.workMode, acc.brandName, memberKey]);

  const p = useMemo(() => plan(acc), [acc]);
  // 회원 목록에서 바로 알 수 있는 줄은 그때그때(회원을 넣으면 바로 체크)
  const live = (members || []).filter((m) => m && !m.hidden);
  const facts = factsRaw && {
    ...factsRaw,
    members: live.length > 0, assign: live.length > 0,
    link: live.some((m) => m.member_auth_id),
    goal: factsRaw.inbody && live.some((m) => m.goal && m.goal !== "미설정"),
  };
  const dayDone = facts ? p.day.filter((k) => facts[k]).length : 0;
  const weekDone = facts ? p.week.filter((k) => facts[k]).length : 0;
  const allDone = facts && dayDone === p.day.length && weekDone === p.week.length;

  // 다 끝나면 축하 한 줄을 하루만
  useEffect(() => {
    if (!allDone || doneAt) return;
    const t = new Date().getTime();
    writeLS(DONE_KEY, String(t));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoneAt(t);
  }, [allDone, doneAt]);

  if (!supabase || acc.loading || !isNew || !facts) return null;
  if (allDone) {
    if (doneAt && new Date().getTime() - doneAt > 86400000) return null;
    return (
      <div className="rounded-2xl bg-elevate px-4 py-3 text-[14px] text-ink">
        <Check className="mr-1 inline h-4 w-4 text-cyan-700" aria-hidden="true" /> 처음 시작하기를 다 마쳤어요. 이제 수업에만 집중하세요.
      </div>
    );
  }

  const toggleCollapse = (v) => { setCollapsed(v); writeLS(COLLAPSE_KEY, v ? "1" : null); };
  const dayAll = dayDone === p.day.length;
  const head = dayAll ? `첫 주 ${weekDone} / ${p.week.length}` : `${dayDone} / ${p.day.length} · 첫날 10분`;

  if (collapsed) {
    return (
      <button type="button" onClick={() => toggleCollapse(false)}
        className="flex min-h-[48px] w-full items-center justify-between rounded-2xl border border-line bg-card px-4 text-left shadow-sm">
        <span className="text-[14px] font-semibold text-ink">처음 시작하기 <span className="font-normal text-muted">{head}</span></span>
        <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
      </button>
    );
  }

  const row = (k) => {
    const it = ITEMS[k];
    const done = Boolean(facts[k]);
    return (
      <li key={k} className="border-t border-line first:border-t-0">
        {done ? (
          <div className="flex min-h-[44px] items-center gap-2.5 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-700"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>
            <span className="text-[14px] text-muted line-through">{it.label}</span>
          </div>
        ) : (
          <Link href={it.href} className="flex min-h-[44px] items-center gap-2.5 py-2 no-underline">
            <span className="h-5 w-5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-[14px] font-medium text-ink">{it.label}</span>
              {it.ai && <span className="ml-1.5 whitespace-nowrap rounded-full bg-pt-soft px-2 py-0.5 text-[12px] font-semibold text-pt-text">AI가 더 정확해져요</span>}
              {it.sub && <span className="block text-[12px] text-muted">{it.sub}</span>}
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-primary-strong">하러 가기 <ChevronRight className="inline h-3.5 w-3.5" aria-hidden="true" /></span>
          </Link>
        )}
      </li>
    );
  };

  const showWeek = dayAll || weekOpen;
  return (
    <section className="rounded-2xl border border-line border-l-[3px] border-l-primary bg-card px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
        <h2 className="m-0 text-[15px] font-bold tracking-[-0.02em] text-ink">처음 시작하기</h2>
        <span className="text-[13px] text-muted">{head}</span>
        <button type="button" onClick={() => toggleCollapse(true)} className="ml-auto min-h-[32px] text-[12px] font-semibold text-muted hover:text-ink">나중에 하기</button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevate">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(((dayDone + weekDone) / (p.day.length + p.week.length)) * 100)}%` }} />
      </div>
      {!dayAll && (
        <>
          <p className="m-0 mt-3 text-[13px] font-semibold text-sub">첫날 10분</p>
          <ul className="m-0 list-none p-0">{p.day.map(row)}</ul>
        </>
      )}
      <button type="button" onClick={() => setWeekOpen((v) => !v)} disabled={dayAll}
        className="mt-3 flex w-full items-center gap-1 text-left text-[13px] font-semibold text-sub">
        첫 주 <span className="font-normal text-muted">· 있으면 좋아요 · {weekDone} / {p.week.length}</span>
        {!dayAll && <ChevronDown className={`h-4 w-4 text-muted transition-transform ${weekOpen ? "rotate-180" : ""}`} aria-hidden="true" />}
      </button>
      {showWeek && <ul className="m-0 list-none p-0">{p.week.map(row)}</ul>}
    </section>
  );
}

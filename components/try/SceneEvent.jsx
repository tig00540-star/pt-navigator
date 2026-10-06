"use client";

/* 체험 장면 ② 회원 이벤트(2026-10-06) — 트레이너: 이벤트 만들기 → 회원: 홈 띠 · 참여하기 → 트레이너: 참여 명단 · 지급 완료.
   실제 앱: EventManager(설정 › 이벤트) · MemberEvents(회원 홈) · 진행 = 기간 안 오운완 일수(서버 집계). */

import { useState } from "react";
import { Check, Gift, Trophy } from "lucide-react";
import { Duo, Guide, useBanner, Card, Title, Tap, AppBar } from "@/components/try/Stage";

const STEPS = [
  { t: "트레이너가 이벤트 열기", hint: "트레이너 폰에서 내용을 바꿔 보고 '이벤트 만들기'를 눌러 보세요." },
  { t: "회원이 참여", hint: "회원 폰 홈에 뜬 이벤트를 눌러 '참여하기'를 해 보세요." },
  { t: "명단 · 상품 지급", hint: "트레이너 폰 참여 명단에서 다 채운 회원에게 '지급 완료'를 눌러 보세요." },
];
// 다른 회원 — 기간 안 오운완 일수(이미 참여 중)
const OTHERS = [{ name: "표막판", days: 12 }, { name: "송미리", days: 7 }, { name: "왕근력", days: 4 }];

export default function SceneEvent({ onReset }) {
  const [at, setAt] = useState(0);
  const [side, setSide] = useState(0);
  const [title, setTitle] = useState("10월 출석 챌린지");
  const [goal, setGoal] = useState(12);
  const [reward, setReward] = useState("프로틴 쉐이크 1잔");
  const [open, setOpen] = useState(false);       // 회원: 자세히
  const [joined, setJoined] = useState(false);
  const [paid, setPaid] = useState([]);
  const [tBanner, tNotify] = useBanner();
  const [mBanner, mNotify] = useBanner();
  const myDays = 5;

  const create = () => {
    setAt(1);
    mNotify("새 이벤트가 열렸어요", `${title} · ${reward}`);
    setTimeout(() => setSide(1), 600);
  };
  const join = () => {
    setJoined(true); setOpen(false); setAt(2);
    tNotify("이벤트에 참여했어요", `나개근 님 · ${title}`);
    setTimeout(() => setSide(0), 900);
  };
  const people = joined ? [...OTHERS, { name: "나개근", days: myDays, me: true }] : OTHERS;

  const trainer = at === 0 ? (
    <div className="try-in">
      <AppBar title="이벤트 만들기" sub="설정 › 이벤트" />
      <Card className="space-y-3">
        <div className="flex gap-1 rounded-full bg-elevate p-[3px]">
          <span className="flex-1 rounded-full bg-card py-1.5 text-center text-[13.5px] font-semibold text-ink shadow-sm">출석 챌린지</span>
          <span className="flex-1 py-1.5 text-center text-[13.5px] text-sub">일반 이벤트</span>
        </div>
        <label className="block text-[13px] font-semibold text-ink">제목
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 20))} className="mt-1 block min-h-[42px] w-full rounded-lg border border-line bg-elevate px-3 text-[15px]" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[13px] font-semibold text-ink">오운완 목표
            <select value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="mt-1 block min-h-[42px] w-full rounded-lg border border-line bg-elevate px-2 text-[15px]">
              {[8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n}회</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-semibold text-ink">상품
            <input value={reward} onChange={(e) => setReward(e.target.value.slice(0, 16))} className="mt-1 block min-h-[42px] w-full rounded-lg border border-line bg-elevate px-3 text-[15px]" />
          </label>
        </div>
        <p className="m-0 text-[13px] text-sub">기간 10/1~10/31 · 신청 10/10까지 · 정원 30명 · 내 회원 대상</p>
        <Tap pulse onClick={create}>이벤트 만들기</Tap>
      </Card>
    </div>
  ) : (
    <div className="try-in space-y-3">
      <AppBar title={title} sub="진행 중" />
      <Card>
        <Title><span className="inline-flex items-center gap-1.5"><Trophy className="h-4 w-4 text-primary-strong" aria-hidden="true" />참여 명단 {people.length}명</span></Title>
        <ul className="m-0 list-none space-y-2 p-0">
          {people.map((p) => {
            const done = p.days >= goal;
            return (
              <li key={p.name} className={`rounded-xl px-3 py-2.5 ${p.me ? "try-in bg-primary-soft" : "bg-elevate"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14.5px] font-semibold text-ink">{p.name}{p.me && <span className="ml-1.5 text-[12px] font-bold text-primary-strong">방금 참여</span>}</span>
                  <span className="tabular-nums text-[13px] text-sub">{Math.min(p.days, goal)}/{goal}회</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (p.days / goal) * 100)}%` }} /></div>
                {done && (paid.includes(p.name)
                  ? <p className="m-0 mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-cyan-700"><Check className="h-3.5 w-3.5" aria-hidden="true" />{reward} 지급 완료</p>
                  : <button type="button" onClick={() => { setPaid([...paid, p.name]); if (at >= 2) setAt(3); }} className={`mt-1.5 min-h-[34px] rounded-lg border border-primary/40 bg-card px-3 text-[13px] font-semibold text-primary-strong ${at === 2 ? "try-pulse" : ""}`}>달성 · 지급 완료</button>)}
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="m-0 text-[12.5px] text-muted">진행 = 이벤트 기간 안 회원이 운동한 날(PT · 개인운동 · 유산소) · 자동 집계</p>
    </div>
  );

  const member = (
    <div>
      <AppBar title="나개근 회원님" sub="회원 전용 페이지" />
      {at >= 1 && (
        <button type="button" onClick={() => setOpen(true)}
          className={`try-in mb-3 flex w-full items-center gap-3 rounded-2xl bg-primary-soft px-3.5 py-3 text-left ${!joined ? "try-pulse" : ""}`}>
          <Gift className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink">{title}</span>
            <span className="block text-[13px] text-sub">{joined ? `참여 중 · ${myDays}/${goal}회` : `${reward} · 눌러서 자세히`}</span>
          </span>
        </button>
      )}
      {open && (
        <Card className="try-in mb-3 border-primary/30">
          <Title>{title}</Title>
          <p className="m-0 text-[14px] text-ink">10월 한 달 동안 오운완 {goal}일을 채우면 <b>{reward}</b>를 드려요.</p>
          <p className="m-0 mt-1 text-[13px] text-sub">기간 10/1~10/31 · 신청 10/10까지 · 참여하면 취소할 수 없어요.</p>
          <div className="mt-3"><Tap pulse onClick={join}>참여하기</Tap></div>
        </Card>
      )}
      <Card className="mb-3">
        <p className="m-0 text-[13px] text-sub">내 PT</p>
        <p className="m-0 text-[22px] font-black text-ink">남은 수업 12회</p>
        <p className="m-0 text-[13px] text-sub">다음 수업 10월 8일(목) 오전 8시</p>
      </Card>
      <Card>
        <p className="m-0 text-[13px] text-sub">오운완</p>
        <p className="m-0 text-[18px] font-black text-ink">이번 달 {myDays}일 · 5일 연속</p>
      </Card>
    </div>
  );

  return (
    <div className="space-y-4">
      <Guide steps={STEPS} at={at} onReset={onReset} />
      <Duo side={side} setSide={setSide}
        left={{ key: "t", label: "트레이너 폰", tone: "trainer", screen: trainer, banner: tBanner, dot: at === 2 }}
        right={{ key: "m", label: "회원 폰", tone: "member", screen: member, banner: mBanner, dot: at === 1 }} />
    </div>
  );
}

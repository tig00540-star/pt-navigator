"use client";

/* 체험 장면 ③ 수업 예약 요청(2026-10-06) — 회원: 새 수업 요청(이번 주 + 다음 주 · 트레이너 바쁜 칸 흐림) → 트레이너: 승인 → 회원: 잡힌 수업.
   실제 앱: BookingCard(회원) · ApptRequestToday(트레이너) · DB 함수 decide_appt_request가 예약을 실제로 넣는다. 변경 · 취소는 N시간 전까지. */

import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { Duo, Guide, useBanner, Card, Title, Tap, AppBar } from "@/components/try/Stage";

const DAYS = [["8", "목"], ["9", "금"], ["10", "토"], ["13", "화"]];
const HOURS = [7, 8, 19, 20, 21];
const BUSY = new Set(["8-19", "9-20", "10-8", "13-21", "8-8"]);
const STEPS = [
  { t: "회원이 원하는 시간 요청", hint: "회원 폰에서 '새 수업 요청하기' → 빈 칸 하나를 고르고 요청을 보내 보세요." },
  { t: "트레이너가 승인", hint: "트레이너 폰의 '수업 요청' 카드에서 '승인'을 눌러 보세요." },
  { t: "양쪽 일정에 반영", hint: "" },
];
const ko = (d, h) => `10월 ${d}일(${DAYS.find((x) => x[0] === d)?.[1]}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시`;

export default function SceneBooking({ onReset }) {
  const [at, setAt] = useState(0);
  const [side, setSide] = useState(0);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState(null);       // "9-19"
  const [state, setState] = useState("none");   // none | pending | approved
  const [mBanner, mNotify] = useBanner();
  const [tBanner, tNotify] = useBanner();
  const [d, h] = pick ? [pick.split("-")[0], Number(pick.split("-")[1])] : [null, null];

  const send = () => {
    setState("pending"); setPicking(false); setAt(1);
    tNotify("수업 요청이 왔어요", `나개근 님 · 새 수업 · ${ko(d, h)}`);
    setTimeout(() => setSide(1), 600);
  };
  const approve = () => {
    setState("approved"); setAt(3);
    mNotify("수업 요청이 승인됐어요", `${ko(d, h)} · 오직이 트레이너`);
    setTimeout(() => setSide(0), 900);
  };

  const member = (
    <div>
      <AppBar title="나개근 회원님" sub="회원 전용 페이지" />
      <Card className="space-y-2.5">
        <p className="m-0 text-[13px] text-sub">내 PT · 남은 수업 <b className="text-ink">12회</b></p>
        <Title><span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-primary-strong" aria-hidden="true" />수업 일정</span></Title>
        <div className="rounded-xl bg-elevate px-3 py-2.5">
          <p className="m-0 text-[14.5px] font-semibold text-ink">10월 8일(목) 오전 8시</p>
          <div className="mt-1.5 flex gap-2 text-[13px]"><span className="rounded-lg border border-line bg-card px-2.5 py-1 text-sub">시간 바꾸기</span><span className="rounded-lg border border-line bg-card px-2.5 py-1 text-sub">취소하기</span></div>
        </div>
        {state === "approved" && (
          <div className="try-in rounded-xl border border-primary/30 bg-primary-soft px-3 py-2.5">
            <p className="m-0 inline-flex items-center gap-1 text-[14.5px] font-semibold text-ink"><Check className="h-4 w-4 text-cyan-700" aria-hidden="true" />{ko(d, h)}</p>
            <p className="m-0 text-[12.5px] text-sub">트레이너가 승인했어요</p>
          </div>
        )}
        {state === "pending" && (
          <div className="try-in rounded-xl border border-dashed border-line-strong px-3 py-2.5">
            <p className="m-0 text-[14px] font-semibold text-ink">{ko(d, h)}</p>
            <p className="m-0 text-[12.5px] text-sub">트레이너 확인 중 · 요청 취소</p>
          </div>
        )}
        {state === "none" && !picking && <Tap pulse onClick={() => setPicking(true)}>새 수업 요청하기</Tap>}
        {picking && (
          <div className="try-in">
            <p className="m-0 mb-1.5 text-[12.5px] text-sub">흐린 칸은 트레이너가 이미 수업이 있는 시간이에요.</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center text-[12.5px]">
                <thead><tr><th className="w-10" />{DAYS.map(([dd, w]) => <th key={dd} className="pb-1 font-semibold text-sub">{dd}일 {w}</th>)}</tr></thead>
                <tbody>
                  {HOURS.map((hh) => (
                    <tr key={hh}>
                      <td className="pr-1 text-right text-muted">{hh}시</td>
                      {DAYS.map(([dd]) => {
                        const k = `${dd}-${hh}`, busy = BUSY.has(k), on = pick === k;
                        return (
                          <td key={k} className="p-0.5">
                            <button type="button" disabled={busy} onClick={() => setPick(k)} aria-pressed={on}
                              className={`h-8 w-full rounded-md text-[12px] ${busy ? "bg-line/60 text-muted" : on ? "bg-primary font-bold text-white" : "border border-line bg-card text-ink"}`}>{busy ? "수업" : on ? "✓" : ""}</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2.5"><Tap pulse={Boolean(pick)} disabled={!pick} onClick={send}>{pick ? `${ko(d, h)} 요청 보내기` : "시간을 골라 주세요"}</Tap></div>
          </div>
        )}
        <p className="m-0 text-[12px] text-muted">변경 · 취소 · 새 요청은 수업 12시간 전까지(트레이너가 정함). 지나면 &ldquo;트레이너와 직접 이야기해 주세요&rdquo;가 떠요.</p>
      </Card>
    </div>
  );

  const trainer = (
    <div>
      <AppBar title="오직이 트레이너님" sub="홈" />
      {state === "pending" ? (
        <Card className="try-in border-l-[3px] border-l-primary">
          <Title>수업 요청 1</Title>
          <p className="m-0 text-[14.5px] font-semibold text-ink">나개근 · 새 수업</p>
          <p className="m-0 text-[13.5px] text-sub">{ko(d, h)}</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Tap pulse onClick={approve}>승인</Tap>
            <Tap tone="ghost" onClick={() => { setState("none"); setPick(null); setAt(0); setSide(0); }}>거절</Tap>
          </div>
          <p className="m-0 mt-2 text-[12px] text-muted">승인하면 스케줄에 바로 들어가요. 같은 시간에 다른 수업이 있으면 막아 줘요.</p>
        </Card>
      ) : state === "approved" ? (
        <Card className="try-in">
          <Title>이번 주 스케줄</Title>
          <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px]">
            <li className="rounded-lg bg-elevate px-3 py-2">10월 8일(목) 오전 8시 · 나개근</li>
            <li className="rounded-lg bg-primary-soft px-3 py-2 font-semibold text-ink">{ko(d, h)} · 나개근 · 방금 승인</li>
            <li className="rounded-lg bg-elevate px-3 py-2">10월 9일(금) 오후 8시 · 송미리</li>
          </ul>
        </Card>
      ) : (
        <p className="m-0 rounded-xl bg-elevate px-3.5 py-3 text-[13.5px] text-muted">회원이 예약 · 변경 · 취소를 요청하면 여기 떠요. 카톡으로 시간 맞추느라 주고받던 연락이 줄어요.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Guide steps={STEPS.map((s, i) => (i === 2 ? { ...s, hint: "회원 폰에 승인 알림이 오고 일정에 들어갔어요." } : s))} at={at === 3 ? 3 : at} onReset={onReset} />
      <Duo side={side} setSide={setSide}
        left={{ key: "m", label: "회원 폰", tone: "member", screen: member, banner: mBanner, dot: at === 3 }}
        right={{ key: "t", label: "트레이너 폰", tone: "trainer", screen: trainer, banner: tBanner, dot: at === 1 }} />
    </div>
  );
}

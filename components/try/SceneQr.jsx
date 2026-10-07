"use client";

/* 체험 장면 ① QR로 OT 신청(2026-10-06) — 회원 폰: 신청서 → 트레이너 폰: '새 OT 회원' → 미리 아는 정보 → 1차 OT 잡기.
   실제 앱: /join/[code](공개 신청서) · OtApplicationToday · OtDashboard. 여기선 이 화면 안에서만 움직인다. */

import { useState } from "react";
import { CalendarPlus, ClipboardList, UserPlus } from "lucide-react";
import { formatSlots, DAY_LABELS } from "@/lib/slots";
import { Duo, Guide, useBanner, Card, Title, Tap, AppBar } from "@/components/try/Stage";

const HOURS = [7, 8, 12, 18, 19, 20, 21];
const GOALS = ["체지방 감량", "근력 · 탄탄한 몸", "자세 교정", "건강 · 체력"];
const STEPS = [
  { t: "회원이 QR로 신청", hint: "회원 폰에서 요일 · 시간을 고르고 '신청하기'를 눌러 보세요." },
  { t: "트레이너에게 바로 도착", hint: "트레이너 폰에 온 '새 OT 회원' 카드를 눌러 보세요." },
  { t: "미리 아는 정보로 첫 OT", hint: "원하는 시간을 보고 '1차 OT 잡기'를 눌러 보세요." },
];

export default function SceneQr({ onReset }) {
  const [at, setAt] = useState(0);
  const [side, setSide] = useState(0);
  const [name, setName] = useState("김첫날");
  const [days, setDays] = useState([]);
  const [hours, setHours] = useState([]);
  const [goal, setGoal] = useState(GOALS[0]);
  const [agree, setAgree] = useState(false);
  const [view, setView] = useState("home");   // 트레이너 폰: home | member | booked
  const [banner, notify] = useBanner();
  const toggle = (_arr, set, v) => set((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b)));
  const slots = { by_day: Object.fromEntries(days.map((d) => [d, hours])), note: "" };
  const slotTxt = days.length && hours.length ? formatSlots(slots) : "";
  const firstDay = days[0], firstHour = hours[0];

  const submit = () => {
    setAt(1);
    notify("새 OT 회원이 신청했어요", `${name || "새 회원"} 님 · 원하는 시간 ${slotTxt}`);
    setTimeout(() => setSide(1), 600);
  };

  const member = at === 0 ? (
    <div className="try-in">
      <p className="m-0 text-[12.5px] font-semibold text-muted">QR을 찍으면 열리는 신청서</p>
      <h3 className="m-0 mt-1 text-[21px] font-black tracking-[-0.03em] text-ink">OT 신청서</h3>
      <p className="m-0 mt-1 text-[13.5px] text-sub">오트 강남점 · 오직이 트레이너가 받아요. 30초면 신청돼요.</p>
      <Card className="mt-3 space-y-3">
        <label className="block text-[13px] font-semibold text-ink">이름
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 10))} className="mt-1 block min-h-[42px] w-full rounded-lg border border-line bg-elevate px-3 text-[15px]" />
        </label>
        <div>
          <p className="m-0 text-[13px] font-semibold text-ink">원하는 요일</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAY_LABELS.map((d, i) => (
              <button key={d} type="button" onClick={() => toggle(days, setDays, i + 1)} aria-pressed={days.includes(i + 1)}
                className={`h-8 w-8 rounded-full border text-[13.5px] ${days.includes(i + 1) ? "border-primary bg-primary text-white" : "border-line bg-card text-ink"}`}>{d}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="m-0 text-[13px] font-semibold text-ink">되는 시간</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {HOURS.map((h) => (
              <button key={h} type="button" onClick={() => toggle(hours, setHours, h)} aria-pressed={hours.includes(h)}
                className={`min-h-[36px] rounded-full border px-3 text-[13.5px] ${hours.includes(h) ? "border-primary bg-primary text-white" : "border-line bg-card text-ink"}`}>{h}시</button>
            ))}
          </div>
        </div>
        <div>
          <p className="m-0 text-[13px] font-semibold text-ink">운동 목표</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button key={g} type="button" onClick={() => setGoal(g)} aria-pressed={goal === g}
                className={`min-h-[36px] rounded-full border px-3 text-[13.5px] ${goal === g ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-ink"}`}>{g}</button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-sub">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          개인정보 수집 · 이용과 운동일지 확인 방법에 동의해요(체험용)
        </label>
        <Tap onClick={submit} disabled={!days.length || !hours.length || !agree} pulse={days.length > 0 && hours.length > 0 && agree}>신청하기</Tap>
      </Card>
    </div>
  ) : (
    <div className="try-in">
      <Card className="text-center">
        <p className="m-0 text-[18px] font-black text-ink">신청됐어요</p>
        <p className="m-0 mt-1 text-[14px] text-sub">오직이 트레이너가 일정을 잡아 연락드려요.</p>
      </Card>
      <Card className="mt-3">
        <Title>1분만 더 알려 주실래요?</Title>
        <p className="m-0 text-[13.5px] text-sub">주 몇 번 · 운동 경험 · 건강 체크를 한 화면에 하나씩 물어요. 건너뛰어도 신청은 돼요.</p>
      </Card>
    </div>
  );

  const trainer = view === "home" ? (
    <div>
      <AppBar title="오직이 트레이너님" sub="10월 6일 화요일" />
      <Card className="mb-3">
        <p className="m-0 text-[13px] text-sub">오늘 수업</p>
        <p className="m-0 text-[22px] font-black text-ink">6건 <span className="text-[13px] font-semibold text-sub">완료 2 · 남음 4</span></p>
      </Card>
      {at >= 1 ? (
        <button type="button" onClick={() => { setView("member"); setAt(2); }}
          className="try-in try-pulse mb-3 flex w-full items-center gap-3 rounded-2xl border border-line border-l-[3px] border-l-primary bg-card px-3.5 py-3 text-left shadow-sm">
          <UserPlus className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink">새 OT 회원 1</span>
            <span className="block text-[13px] text-sub">{name} · 내 QR로 신청 · 방금</span>
            <span className="block text-[13px] text-sub">원하는 시간 · {slotTxt}</span>
          </span>
        </button>
      ) : (
        <p className="m-0 mb-3 rounded-xl bg-elevate px-3.5 py-3 text-[13.5px] text-muted">회원이 신청하면 여기에 바로 떠요.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {["OT 회원 19명", "PT 회원 51명", "세일즈북", "내 실적"].map((t) => <div key={t} className="rounded-xl bg-card px-3 py-3 text-[13.5px] font-semibold text-ink shadow-sm">{t}</div>)}
      </div>
    </div>
  ) : (
    <div className="try-in space-y-3">
      <AppBar title={name} sub="OT 회원 · 1차 OT 전" />
      <Card>
        <Title>신청서로 미리 알게 된 것</Title>
        <dl className="m-0 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1.5 text-[13.5px]">
          <dt className="text-sub">원하는 시간</dt><dd className="m-0 font-semibold text-ink">{slotTxt}</dd>
          <dt className="text-sub">목표</dt><dd className="m-0 text-ink">{goal}</dd>
          <dt className="text-sub">주 몇 번</dt><dd className="m-0 text-ink">주 2번</dd>
          <dt className="text-sub">알게 된 경로</dt><dd className="m-0 text-ink">인스타그램</dd>
        </dl>
      </Card>
      <Card>
        <Title><span className="inline-flex items-center gap-1.5"><ClipboardList className="h-4 w-4 text-primary-strong" aria-hidden="true" />아직 몰라요</span></Title>
        <p className="m-0 text-[13.5px] text-sub">운동 경험 · 그만둔 이유 → 1차 OT 대본이 첫마디 질문으로 넣어 줘요.</p>
      </Card>
      {view === "booked" ? (
        <Card className="try-in border-l-[3px] border-l-primary">
          <p className="m-0 text-[15px] font-bold text-ink">1차 OT를 잡았어요</p>
          <p className="m-0 mt-0.5 text-[13.5px] text-sub">{DAY_LABELS[(firstDay || 1) - 1]}요일 {firstHour || 19}시 · 회원이 원한 시간이에요. 수업 전에 대본이 만들어져요.</p>
        </Card>
      ) : (
        <Tap pulse onClick={() => { setView("booked"); setAt(3); }}><span className="inline-flex items-center gap-1.5"><CalendarPlus className="h-4 w-4" aria-hidden="true" />1차 OT 잡기 · {DAY_LABELS[(firstDay || 1) - 1]} {firstHour || 19}시</span></Tap>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Guide steps={STEPS} at={at} onReset={onReset} />
      <Duo side={side} setSide={setSide}
        left={{ key: "m", label: "회원 폰", tone: "member", screen: member }}
        right={{ key: "t", label: "트레이너 폰", tone: "trainer", screen: trainer, banner, dot: at === 1 }} />
    </div>
  );
}

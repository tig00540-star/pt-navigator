"use client";

/* 체험 장면 ④ 운동일지 · 회원 확인 · 손서명(2026-10-06) — 트레이너: 일지 저장 → 회원: 확인 창(운동일지 표 + 서명) → 트레이너: 서명 · 수업 확인서.
   실제 앱 부품을 그대로 쓴다: WorkoutLogBody(회원 운동일지 표) · SignaturePad(손가락 서명). 저장은 이 화면 안에서만. */

import { useState } from "react";
import { FileSignature, Mic } from "lucide-react";
import WorkoutLogBody from "@/components/member/WorkoutLogBody";
import SignaturePad from "@/components/member/SignaturePad";
import { Duo, Guide, useBanner, Card, Title, Tap, AppBar } from "@/components/try/Stage";

const STEPS = [
  { t: "트레이너가 운동일지 저장", hint: "트레이너 폰에서 무게를 바꿔 보고 '저장'을 눌러 보세요." },
  { t: "회원이 확인 · 서명", hint: "회원 폰 확인 창 아래 칸에 손가락(마우스)으로 서명하고 '서명하고 확인'을 눌러 보세요." },
  { t: "서명이 수업 기록에", hint: "" },
];
const BASE = [
  { exercise: "벤치프레스", sets: [{ weight: 20, reps: 12 }, { weight: 30, reps: 10 }, { weight: 35, reps: 8 }] },
  { exercise: "랫풀다운", sets: [{ weight: 35, reps: 12 }, { weight: 40, reps: 10 }] },
  { exercise: "레그프레스", sets: [{ weight: 100, reps: 12 }, { weight: 120, reps: 10 }] },
];
const TEXT = "[10.6 · 21회차] 오늘은 상체 밀기 위주로 했어요. 벤치프레스는 견갑을 모은 채로 내리는 연습을 했고, 마지막 세트에서 처음으로 35kg을 8개 성공했어요. 다음 시간엔 하체 위주로 진행할게요.";

export default function SceneSign({ onReset }) {
  const [at, setAt] = useState(0);
  const [side, setSide] = useState(0);
  const [sets, setSets] = useState(BASE);
  const [sig, setSig] = useState(null);
  const [mBanner, mNotify] = useBanner();
  const [tBanner, tNotify] = useBanner();
  const [now] = useState(() => new Date());
  const log = { id: "try", ai_summary: TEXT, sets_structured: sets, session_at: now.toISOString() };
  const bump = (ei, si, d) => setSets((x) => x.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, weight: Math.max(0, s.weight + d) })) })));
  const stamp = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const save = () => {
    setAt(1);
    mNotify("운동일지가 도착했어요", "오늘 수업 내용을 확인하고 서명해 주세요");
    setTimeout(() => setSide(1), 600);
  };
  const confirm = () => {
    setAt(3);
    tNotify("회원이 운동일지를 확인했어요", `나개근 님 · 서명 · ${stamp}`);
    setTimeout(() => setSide(0), 900);
  };

  const trainer = at === 0 ? (
    <div className="try-in">
      <AppBar title="운동일지 쓰기" sub="나개근 · 오늘 19:00" />
      <p className="m-0 mb-2 inline-flex items-center gap-1.5 rounded-lg bg-elevate px-2.5 py-1.5 text-[12.5px] text-sub"><Mic className="h-3.5 w-3.5" aria-hidden="true" />말로 30초 녹음하면 이렇게 정리돼요(체험은 미리 정리한 내용)</p>
      <Card className="space-y-2.5">
        {sets.map((e, ei) => (
          <div key={e.exercise}>
            <p className="m-0 text-[14.5px] font-bold text-ink">{e.exercise}</p>
            <div className="mt-1 space-y-1">
              {e.sets.map((s, si) => (
                <div key={si} className="flex items-center gap-2 text-[13.5px]">
                  <span className="w-10 text-sub">{si + 1}세트</span>
                  <button type="button" onClick={() => bump(ei, si, -5)} className="h-7 w-7 rounded-md border border-line bg-card" aria-label="5kg 빼기">−</button>
                  <span className="w-14 text-center tabular-nums font-semibold text-ink">{s.weight}kg</span>
                  <button type="button" onClick={() => bump(ei, si, 5)} className="h-7 w-7 rounded-md border border-line bg-card" aria-label="5kg 더하기">+</button>
                  <span className="tabular-nums text-sub">× {s.reps}회</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <Tap pulse onClick={save}>저장(오늘 수업 완료 · 회원에게 확인 요청)</Tap>
      </Card>
    </div>
  ) : (
    <div className="try-in space-y-3">
      <AppBar title="나개근 · 지난 수업" sub="수업 확인서 · 운동일지" />
      <Card>
        <div className="flex items-center justify-between">
          <p className="m-0 text-[14.5px] font-bold text-ink">오늘 19:00 · 21회차</p>
          {at >= 3 ? <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[12px] font-semibold text-cyan-800">회원 확인 · {stamp}</span>
            : <span className="rounded-full bg-elevate px-2 py-0.5 text-[12px] font-semibold text-sub">확인 기다리는 중</span>}
        </div>
        <p className="m-0 mt-1 text-[13px] text-sub">{sets.map((e) => e.exercise).join(" · ")}</p>
        {at >= 3 && sig && (
          <div className="try-in mt-2 flex items-center gap-2 rounded-xl border border-line bg-white px-2 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sig} alt="회원 서명" className="h-10 w-auto" />
            <span className="text-[12px] text-sub">회원 서명 · 서명 시각은 서버 기록</span>
          </div>
        )}
      </Card>
      {at >= 3 && (
        <Card className="try-in">
          <Title><span className="inline-flex items-center gap-1.5"><FileSignature className="h-4 w-4 text-primary-strong" aria-hidden="true" />10월 수업 확인서</span></Title>
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead><tr className="border-b border-ink"><th className="py-1">날짜</th><th className="py-1">확인</th><th className="py-1">서명</th></tr></thead>
            <tbody>
              <tr className="border-b border-line"><td className="py-1">10/1(목)</td><td>회원 확인</td><td className="text-muted">서명</td></tr>
              <tr className="border-b border-line"><td className="py-1">10/4(일)</td><td>자동 확인 · 서명</td><td className="text-muted">서명</td></tr>
              <tr className="bg-primary-soft"><td className="py-1 font-semibold">오늘</td><td className="font-semibold">회원 확인</td><td>
                {sig && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sig} alt="회원 서명" className="h-7 w-auto" />
                )}
              </td></tr>
            </tbody>
          </table>
          <p className="m-0 mt-1.5 text-[12px] text-muted">한 달 한 장으로 인쇄 · PDF 저장(종이 수업 확인 서명 대신)</p>
        </Card>
      )}
    </div>
  );

  const member = (
    <div>
      <AppBar title="나개근 회원님" sub="회원 전용 페이지" />
      {at === 0 && <p className="m-0 rounded-xl bg-elevate px-3.5 py-3 text-[13.5px] text-muted">트레이너가 운동일지를 저장하면 확인 창이 떠요.</p>}
      {at >= 1 && at < 3 && (
        <div className="try-in rounded-2xl border border-line bg-card p-3 shadow-[var(--shadow-pop)]">
          <p className="m-0 text-[16px] font-bold text-ink">운동일지 확인</p>
          <div className="mt-2 rounded-xl bg-elevate p-2.5"><WorkoutLogBody log={log} /></div>
          <p className="m-0 mt-3 text-[15px] font-bold text-ink">오늘 수업을 확인합니다</p>
          <p className="m-0 mb-2 text-[12.5px] text-sub">받은 수업이 맞으면 서명해 주세요. 다르면 &lsquo;내용이 달라요&rsquo;를 눌러 주세요.</p>
          <SignaturePad onChange={(v) => { setSig(v); if (v && at === 1) setAt(2); }} height={130} />
          <div className="mt-2 space-y-2">
            <Tap pulse={Boolean(sig)} disabled={!sig} onClick={confirm}>{sig ? "서명하고 확인" : "서명하면 확인할 수 있어요"}</Tap>
            <Tap tone="ghost">내용이 달라요</Tap>
          </div>
        </div>
      )}
      {at >= 3 && (
        <Card className="try-in">
          <p className="m-0 text-[15px] font-bold text-ink">확인했어요</p>
          <p className="m-0 mt-1 text-[13.5px] text-sub">오늘 수업 운동일지는 &lsquo;운동일지&rsquo; 탭에서 언제든 다시 볼 수 있어요.</p>
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Guide steps={STEPS.map((s, i) => (i === 2 ? { ...s, hint: "트레이너 쪽 기록에 서명이 붙고, 월별 수업 확인서에 모여요." } : s))} at={at === 2 ? 1 : at} onReset={onReset} />
      <Duo side={side} setSide={setSide}
        left={{ key: "t", label: "트레이너 폰", tone: "trainer", screen: trainer, banner: tBanner, dot: at === 3 }}
        right={{ key: "m", label: "회원 폰", tone: "member", screen: member, banner: mBanner, dot: at === 1 }} />
    </div>
  );
}

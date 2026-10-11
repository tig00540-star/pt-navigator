"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 링크 */

/* =========================================================================
   회원 전용 페이지 식단(2026-10-11 · 1단계) — 트레이너가 식단 관리를 켠 PT 회원에게만(member_diet_plan).
   DietSection(기록하기 탭 맨 위): 오늘 식단(사진 · 글 · 먹은 시각) → [오늘 식단 끝] · 내 식단 가이드(목표 · 예시 식단 ·
     '식단 짜 주세요' 하루 3번) · 오늘 요청과 답.
   DietFeedbackHome(홈): 어제 식단 피드백 · 새로 온 식단 답(트레이너 이름으로만 · AI 표시 없음).
   둘 다 열 때 /api/diet {action:'auto'}를 한 번 부른다 — 트레이너가 안 한 답 · 피드백을 AI가 대신(예약 작업 없이도 돌게).
   하루 = 오전 6시 ~ 다음 날 오전 6시(lib/diet). 쓰기는 DB가 막는다(지난 회원 · 남은 수업 0회 · 식단 꺼짐).
   ========================================================================= */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronDown, Salad, Trash2, Utensils } from "lucide-react";
import { compressImage } from "@/lib/image";
import { notifyPush } from "@/lib/pushClient";
import { dietToday, timeLabel, dayLabel, addDays, purposeLabel, DIET_SITUATIONS, DIET_REQUESTS_PER_DAY } from "@/lib/diet";
import Modal from "@/components/ui/Modal";

const URL_TTL = 3600;
const card = "mb-6 rounded-2xl border border-line bg-card p-5 shadow-sm break-keep text-pretty";
const chip = (on) => `min-h-[36px] rounded-full border px-3 text-[13px] transition ${on ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line bg-card text-sub"}`;
const WAIT_COPY = (seq) => (seq >= 3 ? "트레이너가 바쁘면 늦을 수도 있어요 😅" : "트레이너가 확인하고 답해 드려요. 수업 중엔 조금 늦을 수 있어요 🙏");

function useAuthHeaders(supabase) {
  return useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, [supabase]);
}

// 트레이너가 안 한 답 · 피드백을 AI가 대신(열 때 한 번 · 실패해도 화면은 그대로)
async function runAuto(headers) {
  try {
    await fetch("/api/diet", { method: "POST", headers: { "Content-Type": "application/json", ...(await headers()) }, body: JSON.stringify({ action: "auto" }) });
  } catch { /* 다음에 다시 */ }
}

function MacroBar({ label, got, goal, unit }) {
  if (!goal || got == null) return null;
  const pct = Math.min(100, Math.round((got / goal) * 100));
  const over = got > goal * 1.1;
  return (
    <div className="grid grid-cols-[52px_1fr_auto] items-center gap-2 text-[13px]">
      <span className="text-sub">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-elevate"><span className={`block h-full rounded-full ${over ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} /></span>
      <span className="tabular-nums text-ink">약 {Number(got).toLocaleString()} / {Number(goal).toLocaleString()}{unit}</span>
    </div>
  );
}

export function FeedbackBody({ fb }) {
  if (!fb) return null;
  const t = fb.totals, g = fb.target;
  return (
    <div className="space-y-2">
      {t && g && (
        <div className="space-y-1.5">
          <MacroBar label="열량" got={t.kcal} goal={g.kcal} unit="kcal" />
          <MacroBar label="단백질" got={t.protein} goal={g.protein} unit="g" />
          <MacroBar label="탄수화물" got={t.carb} goal={g.carb} unit="g" />
        </div>
      )}
      {fb.good && <p className="m-0 rounded-xl bg-sky-50 px-3 py-2 text-[14px] leading-relaxed text-ink"><b className="mb-0.5 block text-[12px] font-semibold text-sky-700">잘한 점</b>{fb.good}</p>}
      {fb.next && <p className="m-0 rounded-xl bg-primary-soft px-3 py-2 text-[14px] leading-relaxed text-ink"><b className="mb-0.5 block text-[12px] font-semibold text-primary-strong">오늘 하나만</b>{fb.next}</p>}
      {fb.timing && <p className="m-0 rounded-xl bg-elevate px-3 py-2 text-[14px] leading-relaxed text-ink"><b className="mb-0.5 block text-[12px] font-semibold text-muted">먹은 시간</b>{fb.timing}</p>}
      {fb.note && <p className="m-0 rounded-xl bg-elevate px-3 py-2 text-[14px] leading-relaxed text-ink"><b className="mb-0.5 block text-[12px] font-semibold text-muted">한마디</b>{fb.note}</p>}
      {t && <p className="m-0 text-[12px] text-muted">사진 기준 추정이에요.</p>}
    </div>
  );
}

export function AnswerBody({ answer }) {
  if (!answer) return null;
  if (answer.text) return <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{answer.text}</p>;
  return (
    <div className="space-y-2">
      {answer.intro && <p className="m-0 text-[14px] leading-relaxed text-ink">{answer.intro}</p>}
      {(answer.plan || []).map((p, i) => (
        <div key={i} className="rounded-xl bg-elevate px-3 py-2">
          <p className="m-0 text-[12px] font-semibold text-muted">{p.title}</p>
          {/* '아침: … / 점심: …'처럼 한 줄로 오면 끼니마다 줄을 나눈다 */}
          {String(p.items || "").split(/\s*\/\s*/).filter(Boolean).map((line, j) => <p key={j} className="m-0 text-[14px] leading-relaxed text-ink">{line}</p>)}
          {p.tip && <p className="m-0 mt-0.5 text-[13px] text-sub">{p.tip}</p>}
        </div>
      ))}
      {answer.closing && <p className="m-0 text-[14px] leading-relaxed text-ink">{answer.closing}</p>}
    </div>
  );
}

/* ── 홈: 어제 식단 피드백 · 새로 온 식단 답 ── */
export function DietFeedbackHome({ supabase, onGoWrite }) {
  const headers = useAuthHeaders(supabase);
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data: plan, error } = await supabase.from("member_diet_plan").select("purpose").maybeSingle();
      if (error || !plan) return;
      await runAuto(headers);
      const [d, r] = await Promise.all([
        supabase.from("member_diet_day").select("*").not("feedback", "is", null).gte("day", addDays(dietToday(), -2)).order("day", { ascending: false }).limit(1),
        supabase.from("member_diet_request").select("*").eq("status", "answered").is("member_seen_at", null).order("answered_at", { ascending: false }).limit(3),
      ]);
      if (alive) setData({ day: d.data?.[0] || null, answers: r.data || [] });
    })();
    return () => { alive = false; };
  }, [supabase, headers]);
  if (!data || (!data.day && !data.answers.length)) return null;
  const d = data.day;
  return (
    <section className={card}>
      {d && (
        <>
          <h2 className="mb-2 flex items-center justify-between gap-2 text-[15px] font-bold text-ink">
            <span className="flex items-center gap-1.5"><Salad className="h-4 w-4 text-primary-strong" aria-hidden="true" /> {d.day === addDays(dietToday(), -1) ? "어제" : dayLabel(d.day)} 식단 피드백</span>
            {d.trainer_name && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[12px] font-semibold text-sky-700">{d.trainer_name} 트레이너</span>}
          </h2>
          <FeedbackBody fb={d.feedback} />
        </>
      )}
      {data.answers.length > 0 && (
        <button type="button" onClick={() => { supabase.rpc("diet_mark_seen").then(() => {}); onGoWrite?.(); }}
          className={`flex min-h-[44px] w-full items-center justify-between rounded-xl bg-primary-soft px-3 text-[14px] font-semibold text-primary-strong ${d ? "mt-3" : ""}`}>
          요청한 식단이 왔어요 · {data.answers.length}개 <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );
}

/* ── 기록하기: 오늘 식단 · 내 식단 가이드 ── */
export default function DietSection({ supabase, me, trainedToday = false }) {
  const headers = useAuthHeaders(supabase);
  const [plan, setPlan] = useState(undefined);       // undefined = 읽는 중 · null = 꺼짐
  const [meals, setMeals] = useState([]);
  const [urls, setUrls] = useState({});
  const [days, setDays] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState(null);
  const [memo, setMemo] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const [scope, setScope] = useState("today");
  const [sits, setSits] = useState([]);
  const [note, setNote] = useState("");
  const [exOpen, setExOpen] = useState(false);
  const today = dietToday();

  const load = useCallback(async () => {
    if (!supabase || !me?.id) return;
    const { data: p, error } = await supabase.from("member_diet_plan").select("*").maybeSingle();
    if (error || !p) { setPlan(null); return; }
    const [m, d, r] = await Promise.all([
      supabase.from("diet_meal").select("*").gte("day", addDays(today, -1)).order("eaten_at", { ascending: true }),
      supabase.from("member_diet_day").select("*").gte("day", addDays(today, -1)),
      supabase.from("member_diet_request").select("*").eq("day", today).neq("status", "withdrawn").order("created_at", { ascending: true }),
    ]);
    const ms = m.data || [];
    const paths = ms.map((x) => x.photo_path).filter(Boolean);
    const map = {};
    if (paths.length) {
      const { data: s } = await supabase.storage.from("diet-photos").createSignedUrls(paths, URL_TTL);
      for (const x of s || []) if (x?.signedUrl) map[x.path] = x.signedUrl;
    }
    setPlan(p); setMeals(ms); setUrls(map); setDays(d.data || []); setReqs(r.data || []);
  }, [supabase, me?.id, today]);

  useEffect(() => {
    let alive = true;
    (async () => { await runAuto(headers); if (alive) await load(); })();
    return () => { alive = false; };
  }, [load, headers]);

  const todayMeals = meals.filter((m) => m.day === today);
  const todayDay = days.find((d) => d.day === today);
  const fedToday = Boolean(todayDay?.feedback);
  const closed = Boolean(todayDay?.closed_at);
  const usedReq = reqs.length;
  const kcal = plan ? (trainedToday ? plan.kcal_pt : plan.kcal_rest) : null;
  const week = useMemo(() => {
    if (!plan?.started_on) return null;
    const w = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${plan.started_on}T00:00:00Z`)) / (7 * 86400000)) + 1;
    const total = plan.months ? Math.round(plan.months * 4.345) : null;
    return { w: Math.max(1, w), total };
  }, [plan, today]);

  if (!plan) return null;

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    // 폰 사진의 마지막 수정 시각 = 대개 찍은 시각(오늘 하루 안이면 그대로)
    const t = f.lastModified ? new Date(f.lastModified) : null;
    const local = t && Date.now() - t.getTime() < 20 * 3600000 ? t : new Date();
    const k = new Date(local.getTime() + 9 * 3600000);
    setWhen(`${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`);
    setAdding(true);
  };
  const eatenIso = () => {
    // 'HH:MM'(KST) → 오늘 식단 하루 안의 시각(새벽 0~6시는 다음 날 새벽)
    const [h, mi] = (when || "").split(":").map(Number);
    if (Number.isNaN(h)) return new Date().toISOString();
    const base = Date.parse(`${today}T00:00:00Z`) - 9 * 3600000;   // 그날 KST 0시
    const ms = base + (h < 6 ? h + 24 : h) * 3600000 + (mi || 0) * 60000;
    return new Date(Math.min(ms, Date.now())).toISOString();
  };

  const save = async () => {
    if (busy || (!file && !memo.trim())) return;
    setBusy(true); setMsg("");
    let path = null;
    try {
      if (file) {
        const blob = await compressImage(file, 1024, 0.8);
        path = `${me.id}/${crypto.randomUUID()}.jpg`;
        const { error: ue } = await supabase.storage.from("diet-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (ue) { console.error("식단 사진 올리기 실패", ue); setMsg("사진을 올리지 못했어요. 다시 시도해 주세요."); return; }
      }
      const { data, error } = await supabase.from("diet_meal").insert({ user_id: me.id, eaten_at: eatenIso(), photo_path: path, memo: memo.trim() || null }).select("id");
      if (error || !data?.length) {
        console.error("식단 저장 실패", error);
        if (path) await supabase.storage.from("diet-photos").remove([path]);
        setMsg("저장하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      setFile(null); setMemo(""); setWhen(""); setAdding(false);
      await load();
    } catch (e) {
      console.error(e);
      setMsg("사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("diet_meal").delete().eq("id", m.id).select("id");
      if (error || !data?.length) { setMsg("지우지 못했어요. 피드백을 받은 날은 지울 수 없어요."); return; }
      if (m.photo_path) await supabase.storage.from("diet-photos").remove([m.photo_path]);
      await load();
    } finally { setBusy(false); }
  };

  const closeDay = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("diet_close_day");
    setBusy(false);
    if (error) { setMsg("저장하지 못했어요. 다시 시도해 주세요."); return; }
    notifyPush(headers(), "diet_done", me.id);
    await load();
  };

  const sendReq = async () => {
    if (busy) return;
    if (usedReq >= DIET_REQUESTS_PER_DAY) { setMsg("오늘은 요청을 다 썼어요. 내일 다시 요청해 주세요 🙂"); return; }
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("request_diet", { p_scope: scope, p_situations: sits.length ? sits : null, p_note: note.trim() || null });
    setBusy(false);
    if (error) { setMsg("요청하지 못했어요. 다시 시도해 주세요."); return; }
    if (!data?.ok) { setMsg("오늘은 요청을 다 썼어요. 내일 다시 요청해 주세요 🙂"); setReqOpen(false); return; }
    notifyPush(headers(), "diet_request", data.id);
    setReqOpen(false); setSits([]); setNote("");
    await load();
  };
  const withdraw = async (id) => {
    const { data } = await supabase.rpc("withdraw_diet_request", { p_id: id });
    if (!data) setMsg("이미 답을 준비하고 있어서 취소할 수 없어요.");
    await load();
  };

  const examples = plan.examples?.list || [];

  return (
    <>
      {/* 오늘 식단 */}
      <section className={card}>
        <h2 className="mb-1 flex items-center justify-between gap-2 text-[15px] font-bold text-ink">
          <span className="flex items-center gap-1.5"><Utensils className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 오늘 식단</span>
          {!plan.no_numbers && kcal ? <span className="text-[12px] font-normal text-muted">목표 약 {kcal.toLocaleString()}kcal · {trainedToday ? "운동한 날" : "운동 없는 날"}</span> : null}
        </h2>
        {todayMeals.length === 0 ? (
          <p className="m-0 mb-3 mt-2 text-[13px] text-muted">아직 올린 식단이 없어요. 먹을 때마다 사진이나 글로 남겨 주세요.</p>
        ) : (
          <ul className="m-0 mb-3 mt-2 list-none space-y-2 p-0">
            {todayMeals.map((m) => (
              <li key={m.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-2.5">
                {m.photo_path && urls[m.photo_path]
                  ? <img src={urls[m.photo_path]} alt="식단 사진" className="h-14 w-14 rounded-xl object-cover" />
                  : <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-elevate text-[12px] text-muted">글</span>}
                <span className="min-w-0">
                  <span className="block text-[12px] text-muted">{timeLabel(m.eaten_at)}{m.after_feedback ? " · 피드백 뒤 추가" : ""}</span>
                  <span className="block truncate text-[14px] text-ink">{m.memo || m.analysis?.items || "사진"}</span>
                </span>
                {!fedToday && <button type="button" onClick={() => remove(m)} disabled={busy} aria-label="이 식단 지우기" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-danger-text"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="mb-3 space-y-2 rounded-xl bg-elevate p-3">
            {file && <p className="m-0 text-[13px] text-sub">사진 1장 · 고른 사진이 올라가요</p>}
            <input value={memo} onChange={(e) => setMemo(e.target.value.slice(0, 200))} placeholder="메모(선택) 예: 밥 반 공기 · 단백질 쉐이크 1개"
              className="min-h-[44px] w-full rounded-lg border border-line bg-card px-3 text-[14px] text-ink placeholder-muted" />
            <label className="flex items-center gap-2 text-[13px] text-sub">먹은 시각
              <input type="time" value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-[40px] rounded-lg border border-line bg-card px-2 text-[14px] text-ink" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAdding(false); setFile(null); setMemo(""); }} className="min-h-[44px] flex-1 rounded-xl border border-line bg-card text-[14px] font-semibold text-sub">취소</button>
              <button type="button" onClick={save} disabled={busy || (!file && !memo.trim())} className="min-h-[44px] flex-1 rounded-xl bg-primary text-[14px] font-bold text-white disabled:opacity-50">{busy ? "올리는 중…" : "올리기"}</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-card text-[14px] font-semibold text-ink">
              <Camera className="h-4 w-4" aria-hidden="true" /> 사진 추가
              <input type="file" accept="image/*" onChange={pickFile} className="sr-only" />
            </label>
            <button type="button" onClick={() => { setFile(null); setWhen(""); setAdding(true); }} className="min-h-[44px] rounded-xl border border-line bg-card text-[14px] font-semibold text-ink">글로 남기기</button>
          </div>
        )}

        {todayMeals.length > 0 && !adding && (
          fedToday ? <p className="m-0 mt-3 rounded-xl bg-sky-50 px-3 py-2 text-[13px] font-semibold text-sky-700">오늘 식단 피드백이 왔어요. 홈에서 볼 수 있어요.</p>
            : closed ? <p className="m-0 mt-3 rounded-xl bg-elevate px-3 py-2 text-[13px] text-sub"><Check className="mr-1 inline h-4 w-4 text-sky-700" aria-hidden="true" />트레이너 확인 중이에요. 더 먹으면 계속 올려도 돼요.</p>
            : <button type="button" onClick={closeDay} disabled={busy} className="mt-3 min-h-[48px] w-full rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-50">오늘 식단 끝</button>
        )}
        {msg && <p className="m-0 mt-2 text-[13px] text-danger-text">{msg}</p>}
        <p className="m-0 mt-3 text-[12px] leading-relaxed text-muted">사진 없이 글로만 남겨도 돼요. 오늘 식단은 내일 오전 6시까지예요.</p>
      </section>

      {/* 내 식단 가이드 */}
      <section className={card}>
        <h2 className="mb-2 flex items-center justify-between gap-2 text-[15px] font-bold text-ink">
          <span className="flex items-center gap-1.5"><Salad className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 내 식단 가이드</span>
          <span className="text-[12px] font-normal text-muted">{purposeLabel(plan.purpose)}{week ? ` · ${week.w}주차${week.total ? ` / ${week.total}주` : ""}` : ""}</span>
        </h2>
        {!plan.no_numbers && plan.kcal_rest ? (
          <div className="mb-3 grid grid-cols-2 gap-2 text-[13px]">
            <div className="rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">운동 없는 날</span><b className="text-ink">약 {plan.kcal_rest.toLocaleString()}kcal</b></div>
            <div className="rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">운동한 날</span><b className="text-ink">약 {(plan.kcal_pt || plan.kcal_rest).toLocaleString()}kcal</b></div>
            {plan.protein_g ? <div className="col-span-2 rounded-xl bg-elevate px-3 py-2"><span className="block text-[12px] text-muted">하루 탄수화물 · 단백질 · 지방</span><b className="text-ink">약 {plan.carb_g} · {plan.protein_g} · {plan.fat_g}g</b></div> : null}
          </div>
        ) : plan.no_numbers ? <p className="m-0 mb-3 text-[13px] text-sub">숫자 대신 먹은 것을 기록하며 트레이너와 함께 관리해요.</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setExOpen((v) => !v)} disabled={!examples.length} aria-expanded={exOpen}
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-elevate text-[14px] font-semibold text-sub disabled:opacity-50">
            예시 식단 <ChevronDown className={`h-4 w-4 transition-transform ${exOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { setMsg(""); if (usedReq >= DIET_REQUESTS_PER_DAY) setMsg("오늘은 요청을 다 썼어요. 내일 다시 요청해 주세요 🙂"); else setReqOpen(true); }}
            className="min-h-[44px] rounded-xl border border-primary/40 bg-card text-[14px] font-bold text-primary-strong">식단 짜 주세요</button>
        </div>
        {exOpen && examples.length > 0 && (
          <div className="mt-3 space-y-2">
            {examples.map((e, i) => (
              <div key={i} className="rounded-xl bg-elevate px-3 py-2">
                <p className="m-0 flex justify-between text-[13px] font-semibold text-ink">{e.title}{e.total && <span className="font-normal text-muted">{e.total}</span>}</p>
                {(e.meals || []).map((x, j) => <p key={j} className="m-0 text-[13px] text-sub"><b className="font-semibold text-ink">{x.when}</b> {x.menu}</p>)}
              </div>
            ))}
            {plan.examples?.note && <p className="m-0 text-[12px] text-muted">{plan.examples.note}</p>}
          </div>
        )}

        {reqs.length > 0 && (
          <div className="mt-3 space-y-2">
            {reqs.map((q) => (
              <div key={q.id} className="rounded-xl border border-line px-3 py-2.5">
                <p className="m-0 text-[12px] text-muted">{q.scope === "today" ? "오늘 남은 끼니" : "이번 주"}{q.situations?.length ? ` · ${q.situations.join(", ")}` : ""}</p>
                {q.status === "answered" ? <div className="mt-1"><AnswerBody answer={q.answer} /></div>
                  : q.status === "open" ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="m-0 text-[13px] text-sub">{WAIT_COPY(q.seq)}</p>
                      <button type="button" onClick={() => withdraw(q.id)} className="min-h-[36px] shrink-0 px-1 text-[12px] font-semibold text-muted underline-offset-2 hover:underline">요청 취소</button>
                    </div>
                  ) : <p className="m-0 mt-1 text-[13px] text-muted">트레이너와 직접 이야기해 주세요.</p>}
              </div>
            ))}
          </div>
        )}
        <p className="m-0 mt-3 text-[12px] text-muted">오늘 요청 {usedReq} / {DIET_REQUESTS_PER_DAY}</p>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted">사진 기준 추정이에요. 영양 상담이 아닌 참고용이고, 트레이너가 AI 분석을 활용해 답할 수 있어요.</p>
      </section>

      {reqOpen && (
        <Modal variant="sheet" title="식단 짜 주세요" onClose={() => setReqOpen(false)}
          footer={(
            <div className="space-y-2">
              <button type="button" onClick={sendReq} disabled={busy} className="min-h-[48px] w-full rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-50">{busy ? "요청하는 중…" : "트레이너에게 요청하기"}</button>
              <p className="m-0 text-center text-[12px] text-muted">오늘 요청 {usedReq + 1} / {DIET_REQUESTS_PER_DAY} · {WAIT_COPY(usedReq + 1)}</p>
            </div>
          )}>
          <div className="space-y-4">
            <div>
              <p className="m-0 mb-1.5 text-[13px] font-semibold text-sub">언제</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setScope("today")} className={chip(scope === "today")}>오늘 남은 끼니</button>
                <button type="button" onClick={() => setScope("week")} className={chip(scope === "week")}>이번 주</button>
              </div>
            </div>
            <div>
              <p className="m-0 mb-1.5 text-[13px] font-semibold text-sub">상황 (여러 개 · 선택)</p>
              <div className="flex flex-wrap gap-1.5">
                {DIET_SITUATIONS.map((s) => <button key={s} type="button" onClick={() => setSits((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} className={chip(sits.includes(s))}>{s}</button>)}
              </div>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="더 알려 줄 것(선택) 예: 저녁은 회사 근처에서 먹어요"
              className="min-h-[44px] w-full rounded-lg border border-line bg-elevate px-3 text-[14px] text-ink placeholder-muted" />
            {scope === "today" && <p className="m-0 text-[13px] text-sub">오늘 올린 기록을 보고 남은 끼니를 맞춰 드려요.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

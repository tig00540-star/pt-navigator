"use client";
/* =========================================================================
   대표 화면 '브리핑' 탭 = 아침 보고서 한 장(2026-10-03 개편 · 대표: "어제 결과 + 오늘 예정 · 실패엔 피드백").

   순서: AI 총평 → ① 어제 결과(건별 · 피드백 남기기) → ② 오늘 예정(등록 기회 · 재등록 기회 · 다시 연락할 날)
        → ③ 이달 · 앞으로 들어올 매출 → ④ 지금 주의할 회원 → ⑤ 오늘 챙길 코칭.
   예전 위쪽 '오늘 챙길 것' 카드 3개는 ② 오늘 예정 · ④ 주의와 같은 회원을 한 번 더 보여줘서 합쳤다.

   데이터:
   · 매일 9시(KST) 서버 예약 작업이 owner_daily_report에 미리 만든다(app/api/cron/owner-daily-report) → 열자마자 보인다.
   · 그날 보고서가 아직 없으면(9시 전 · 작업 실패) 지금 데이터로 이 자리에서 만든다(예전 방식 · 하루 캐시).
   · 지난 보고서는 날짜를 골라 다시 본다(저장된 것만).
   · 숫자는 전부 lib/memberStatus ownerReportData(어제 결과 = dailyResults · 오늘 예정 = todayPlan). AI는 총평 · 코칭만.
   피드백: owner_feedback(대표만 쓰기 · 받는 트레이너가 '오늘'에서 봄 · 그 회원 다음 리포트 AI가 반영).
   ========================================================================= */
import { useMemo, useState, useEffect } from "react";
import { CalendarCheck, CheckCircle2, FileText, Loader2, Printer, Wallet, AlertTriangle, Sparkles, MessageSquare, RefreshCw, PhoneCall, ClipboardList, X } from "lucide-react";
import { ownerReportData } from "@/lib/memberStatus";
import { buildOwnerAIInput } from "@/lib/ownerReportAI";
import { won, wonApprox, manwon, personName } from "@/lib/format";
import { labelOf, CLOSING_REASON_OPTS, REG_REASON_OPTS } from "@/lib/labels";
import { supabase } from "@/lib/supabaseClient";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

// 이 페이지 세션에서 자동 생성을 시도한 날(KST ymd) — 실패 시 탭 왕복마다 AI를 다시 부르지 않게.
let autoRunDay = null;
const LS_KEY = "owner-report-v3"; // v3 — 어제 결과 · 오늘 예정이 들어간 모양(옛 캐시는 버린다)

const kstOf = (iso) => new Date(Date.parse(iso) + 9 * 3600000);
const hhmm = (iso) => { const k = kstOf(iso); return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`; };
const mdKo = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일` : "");
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const weekdayOf = (ymd) => DAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

// 결과 배지 — 정적 리터럴(purge-safe).
const RESULT_META = {
  success:            { label: "등록", cls: "bg-cyan-50 text-cyan-700" },
  success_nocontract: { label: "등록 · 계약 미입력", cls: "bg-cyan-50 text-cyan-700" },
  hold:               { label: "보류", cls: "bg-ot-soft text-ot-text" },
  none:               { label: "제안 못 함", cls: "bg-ot-soft text-ot-text" },
  fail:               { label: "그만", cls: "bg-rose-50 text-danger-text" },
};

function loadCache() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveCache(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* 프라이빗 · 용량 = 무시 */ } }

export default function OwnerBriefing({ members = [], otRows = [], contracts = [], logs = [], appts = [], goals = [], trainers = [], ym }) {
  const [nowISO] = useState(() => new Date().toISOString());
  const todayYmd = useMemo(() => kstOf(nowISO).toISOString().slice(0, 10), [nowISO]);
  const nameById = useMemo(() => new Map((members || []).filter((m) => m?.id).map((m) => [m.id, m.name])), [members]);
  const memberName = (id) => personName(nameById.get(id)) || "회원";
  const nameOf = (tid) => personName(trainers.find((t) => t.id === tid)?.name) || "담당 미정";

  const [report, setReport] = useState(null);       // ownerReportData 결과
  const [ai, setAi] = useState(null);               // { headline, coaching }
  const [aiState, setAiState] = useState("idle");   // idle | loading | ready | premium | failed
  const [aiErr, setAiErr] = useState("");
  const [source, setSource] = useState("");         // saved(9시 보고서) | live(지금 만든 것)
  const [generatedAt, setGeneratedAt] = useState("");
  const [dates, setDates] = useState([]);           // 저장된 보고서 날짜(최근 31일)
  const [viewYmd, setViewYmd] = useState(todayYmd);
  const [myUid, setMyUid] = useState(null);
  const [feedback, setFeedback] = useState({});     // ref_id → [{id, body, created_at, seen_at}]
  const [fbOpen, setFbOpen] = useState(null);       // 피드백 입력 중인 ref_id
  const [fbText, setFbText] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [fbErr, setFbErr] = useState("");

  const applyRow = (row) => {
    setReport(row.data);
    const st = row.ai?.state || (row.ai?.headline ? "ready" : "premium");
    setAi(row.ai?.headline || row.ai?.coaching?.length ? { headline: row.ai.headline || "", coaching: row.ai.coaching || [] } : null);
    setAiState(st === "ready" ? "ready" : st === "premium" ? "premium" : "failed");
    setAiErr(st === "failed" ? "AI 총평을 만들지 못해서 기본 코칭을 보여 드렸어요." : "");
    setGeneratedAt(row.generated_at || "");
    setSource("saved");
  };

  async function genLive(uid) {
    const d = ownerReportData({ members, otRows, contracts, logs, appts, goals, ym, nowISO });
    setReport(d); setSource("live");
    setAi(null); setAiErr(""); setAiState("loading");
    const gAt = new Date().toISOString();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/owner-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ input: buildOwnerAIInput(d, nameOf) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && body?.code === "premium_required") {
          setAiState("premium"); setGeneratedAt(gAt);
          saveCache({ ymd: todayYmd, report: d, ai: null, aiState: "premium", generatedAt: gAt, uid });
          return;
        }
        console.error("보고서 AI 실패", body);
        setAiErr("AI 총평을 만들지 못했어요."); setAiState("failed"); return;
      }
      const aiVal = { headline: body?.headline || "", coaching: Array.isArray(body?.coaching) ? body.coaching : [] };
      setAi(aiVal); setAiState("ready"); setGeneratedAt(gAt);
      saveCache({ ymd: todayYmd, report: d, ai: aiVal, aiState: "ready", generatedAt: gAt, uid });
    } catch {
      setAiErr("인터넷 연결을 확인하고 다시 시도해 주세요."); setAiState("failed");
    }
  }

  // 마운트: 오늘 9시 보고서가 있으면 그것, 없으면 지금 데이터로 만든다.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      let uid = null;
      try { const { data: { session } } = await supabase.auth.getSession(); uid = session?.user?.id ?? null; } catch { return; }
      if (cancelled) return;
      setMyUid(uid);
      const [{ data: list }, { data: row }] = await Promise.all([
        supabase.from("owner_daily_report").select("ymd").order("ymd", { ascending: false }).limit(31),
        supabase.from("owner_daily_report").select("*").eq("ymd", todayYmd).maybeSingle(),
      ]);
      if (cancelled) return;
      setDates((list || []).map((r) => r.ymd));
      if (row) { applyRow(row); return; }
      // 9시 보고서가 아직 없음 → 하루 캐시 또는 지금 만들기(예전 방식)
      const c = loadCache();
      if (c && c.ymd === todayYmd && c.report && c.uid && c.uid === uid) {
        setReport(c.report); setAi(c.ai || null); setAiState(c.aiState === "premium" ? "premium" : "ready");
        setGeneratedAt(c.generatedAt || ""); setSource("live");
        return;
      }
      if (autoRunDay === todayYmd) return;
      autoRunDay = todayYmd;
      genLive(uid);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openDate(ymd) {
    setViewYmd(ymd);
    if (!supabase) return;
    const { data: row } = await supabase.from("owner_daily_report").select("*").eq("ymd", ymd).maybeSingle();
    if (row) applyRow(row);
  }

  // 피드백 — 보고서의 '어제'(results.ymd)에 남긴 것.
  const resultsYmd = report?.results?.ymd || null;
  useEffect(() => {
    if (!supabase || !resultsYmd) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("owner_feedback").select("id, ref_id, body, created_at, seen_at").eq("ref_ymd", resultsYmd).order("created_at");
      if (error) { console.error("피드백 조회 실패", error); return; }
      const m = {};
      for (const f of data || []) (m[f.ref_id] ||= []).push(f);
      if (!cancelled) setFeedback(m);
    })();
    return () => { cancelled = true; };
  }, [resultsYmd]);

  async function sendFeedback(item) {
    const body = fbText.trim();
    if (!body) { setFbErr("피드백을 입력해 주세요."); return; }
    setFbSaving(true); setFbErr("");
    try {
      const { data, error } = await supabase.from("owner_feedback").insert({
        trainer_id: item.trainer_id, member_id: item.user_id,
        kind: item.kind === "rereg" ? "rereg" : item.kind === "new" ? "new" : "ot",
        ref_id: item.ref_id, ref_ymd: resultsYmd, body,
      }).select("id, ref_id, body, created_at, seen_at");
      if (error || !data?.length) { console.error("피드백 저장 실패", error); setFbErr("저장하지 못했어요. 대표만 저장할 수 있어요."); return; }
      setFeedback((m) => ({ ...m, [item.ref_id]: [...(m[item.ref_id] || []), data[0]] }));
      setFbOpen(null); setFbText("");
    } catch {
      setFbErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setFbSaving(false);
    }
  }
  async function removeFeedback(refId, id) {
    const { data, error } = await supabase.from("owner_feedback").delete().eq("id", id).select("id");
    if (error || !data?.length) { console.error("피드백 삭제 실패", error); return; }
    setFeedback((m) => ({ ...m, [refId]: (m[refId] || []).filter((f) => f.id !== id) }));
  }

  // 결정적 코칭 폴백(AI 실패 · 프리미엄 아님).
  const fallbackCoaching = (d) => [
    ...(d.trainerCoaching || []).map((c) => `${nameOf(c.trainerId)}: ${c.msg}`),
    ...(d.top3 || []).map((c) => c.title),
  ].slice(0, 6);

  if (!supabase) return null;
  if (!report) {
    return (
      <Card className="flex items-center gap-2 text-[14px] text-sub">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-700" aria-hidden="true" /> 보고서를 불러오는 중…
      </Card>
    );
  }

  const d = report;
  const rs = d.results || null;
  const plan = d.plan || null;
  const reportYmd = d.dateISO || viewYmd;
  const genLabel = (() => {
    if (source === "saved") return "아침 9시 기준";
    if (!generatedAt) return "지금 기준";
    const k = kstOf(generatedAt); const h = k.getUTCHours();
    return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시 ${String(k.getUTCMinutes()).padStart(2, "0")}분 기준`;
  })();
  const what = (i) => (i.kind === "rereg" ? "재등록" : i.kind === "new" ? `${i.round ? `${i.round}차 OT ` : ""}신규 등록` : `${i.round ?? 1}차 OT`);
  const badge = (i) => (i.kind === "rereg" && i.result !== "success"
    ? (i.result === "hold" ? { label: "재등록 보류", cls: RESULT_META.hold.cls } : { label: "재등록 안 함", cls: RESULT_META.fail.cls })
    : RESULT_META[i.result] || RESULT_META.none);

  return (
    <div className="space-y-4 break-keep text-pretty">
      {/* 머리 */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[13px] text-muted">{weekdayOf(reportYmd)}요일 · {genLabel}</p>
          <h2 className="mt-0.5 flex items-center gap-1.5 text-[22px] font-bold tracking-[-0.03em] text-ink">
            <FileText className="h-5 w-5 text-cyan-700" aria-hidden="true" /> {mdKo(reportYmd)} 보고서
          </h2>
        </div>
        <div className="no-print flex items-center gap-2">
          {dates.length > 1 && (
            <select value={viewYmd} onChange={(e) => openDate(e.target.value)} aria-label="지난 보고서"
              className="min-h-[36px] rounded-lg border border-line bg-card px-2.5 text-[13px] text-ink outline-none focus:border-primary">
              {dates.map((y) => <option key={y} value={y}>{y === todayYmd ? `오늘 (${mdKo(y)})` : `${mdKo(y)} (${weekdayOf(y)})`}</option>)}
            </select>
          )}
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-sub hover:text-ink">
            <Printer className="h-4 w-4" aria-hidden="true" /> 인쇄
          </button>
        </div>
      </div>

      {aiState === "ready" && ai?.headline && (
        <p className="rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3.5 text-[16px] font-bold leading-relaxed tracking-[-0.01em] text-primary-strong">{ai.headline}</p>
      )}
      {aiState === "loading" && <p className="inline-flex items-center gap-2 text-[13px] text-muted"><Loader2 className="h-4 w-4 animate-spin text-cyan-700" aria-hidden="true" /> AI 총평 · 코칭 작성 중…</p>}

      {/* ① 어제 결과 */}
      <Card as="section">
        <SectionTitle icon={ClipboardList} aside={rs ? `${mdKo(rs.ymd)} (${weekdayOf(rs.ymd)})` : null}>어제 결과</SectionTitle>
        {!rs ? (
          <p className="text-[13px] text-muted">이 보고서에는 건별 결과가 없어요(이전 형식).</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["매출", won(rs.summary.revenue)],
                ["신규 등록", `${rs.summary.newCount}건`],
                ["재등록", `${rs.summary.reregCount}건`],
                ["보류 · 그만", `${rs.summary.holdCount + rs.summary.failCount}건`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-elevate px-3 py-2.5">
                  <span className="block text-[12px] text-muted">{l}</span>
                  <span className="mt-0.5 block text-[17px] font-bold tracking-[-0.02em] text-ink">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-sub">
              수업 {d.yesterday.total ?? d.yesterday.sessions}건 (PT {d.yesterday.pt ?? d.yesterday.sessions} · OT {d.yesterday.ot ?? 0}){d.yesterday.noshows ? ` · 노쇼 ${d.yesterday.noshows}건` : ""}
            </p>
            {rs.items.length === 0 ? (
              <p className="mt-3 rounded-xl bg-elevate px-3.5 py-3 text-[13px] leading-relaxed text-sub">어제 남긴 등록 · OT 피드백 · 재등록 결과가 없어요. 결과는 OT 피드백과 재등록 결과를 저장한 날로 잡혀요.</p>
            ) : (
              <ul className="m-0 mt-3 list-none space-y-2 p-0">
                {rs.items.map((i) => {
                  const b = badge(i);
                  const fbs = feedback[i.ref_id] || [];
                  const canFb = Boolean(i.trainer_id) && i.trainer_id !== myUid; // 대표 본인 담당 건엔 피드백 버튼 없음
                  const reasonLabel = i.reason ? labelOf(i.kind === "rereg" ? REG_REASON_OPTS : CLOSING_REASON_OPTS, i.reason) : null;
                  return (
                    <li key={`${i.kind}-${i.ref_id}`} className="rounded-xl bg-elevate px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${b.cls}`}>{b.label}</span>
                        <span className="text-[15px] font-semibold text-ink">{memberName(i.user_id)}</span>
                        <span className="text-[13px] text-sub">{what(i)}</span>
                        <span className="ml-auto text-[12.5px] text-muted">{nameOf(i.trainer_id)}</span>
                      </div>
                      {i.result === "success" ? (
                        <p className="mt-1 text-[13px] text-sub">
                          PT {i.sessions}회{i.service ? ` + 서비스 ${i.service}회` : ""} · 회당 {won(i.price)} · <b className="font-semibold text-ink">{won(i.amount)}</b>
                        </p>
                      ) : (
                        <div className="mt-1 space-y-0.5 text-[13px] text-sub">
                          {(reasonLabel || i.proposed === false) && (
                            <p className="m-0">{i.proposed === false ? "등록 제안을 못 했어요" : `이유: ${reasonLabel}`}{i.proposed === false && reasonLabel ? ` · 이유: ${reasonLabel}` : ""}</p>
                          )}
                          {i.quote && <p className="m-0">회원의 말 &ldquo;{i.quote}&rdquo;</p>}
                          {i.reapproachAt && <p className="m-0 text-muted">다음 연락 {mdKo(i.reapproachAt)}</p>}
                        </div>
                      )}
                      {fbs.map((f) => (
                        <div key={f.id} className="mt-2 flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-[13px] text-ink">
                          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700" aria-hidden="true" />
                          <span className="min-w-0 flex-1">{f.body}<span className="ml-1.5 text-[12px] text-muted">{f.seen_at ? "· 트레이너 확인함" : "· 아직 확인 전"}</span></span>
                          <button type="button" onClick={() => removeFeedback(i.ref_id, f.id)} aria-label="피드백 지우기" className="no-print shrink-0 text-muted hover:text-danger-text"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      {canFb && (fbOpen === i.ref_id ? (
                        <div className="no-print mt-2 space-y-2">
                          <textarea value={fbText} onChange={(e) => setFbText(e.target.value)} rows={2} maxLength={1000} autoFocus
                            placeholder={i.result === "success" ? "잘한 점 · 다음에도 이어갈 점" : "다음엔 이렇게 해 보세요 (트레이너 '오늘'에 뜨고, 이 회원 다음 리포트에 반영돼요)"}
                            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[14px] text-ink outline-none focus:border-primary" />
                          {fbErr && <p className="text-[12.5px] text-danger-text">{fbErr}</p>}
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => { setFbOpen(null); setFbText(""); setFbErr(""); }} className="min-h-[36px] rounded-lg px-3 text-[13px] text-sub hover:text-ink">취소</button>
                            <button type="button" onClick={() => sendFeedback(i)} disabled={fbSaving}
                              className="min-h-[36px] rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">{fbSaving ? "보내는 중…" : `${nameOf(i.trainer_id)}에게 보내기`}</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setFbOpen(i.ref_id); setFbText(""); setFbErr(""); }}
                          className="no-print mt-2 inline-flex min-h-[32px] items-center gap-1 text-[13px] font-semibold text-cyan-700 hover:underline">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {fbs.length ? "피드백 더 남기기" : "피드백 남기기"}
                        </button>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Card>

      {/* ② 오늘 예정 */}
      <Card as="section">
        <SectionTitle icon={CalendarCheck} aside={plan ? `수업 ${plan.total}건 · OT ${plan.ot.length} · PT ${plan.ptCount}` : `예약 ${d.today.bookings}건`}>오늘 예정</SectionTitle>
        {!plan ? (
          <p className="text-[13px] text-muted">이 보고서에는 오늘 예정 명단이 없어요(이전 형식).</p>
        ) : plan.ot.length + plan.rereg.length + plan.reconnect.length === 0 ? (
          <p className="text-[13px] text-muted">오늘 따로 챙길 등록 · 재등록 · 연락 대상이 없어요.</p>
        ) : (
          <div className="space-y-3">
            {plan.ot.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-ink">등록 기회 · 오늘 오는 OT 회원</p>
                <ul className="m-0 list-none space-y-1 p-0">
                  {plan.ot.map((o) => (
                    <li key={`ot-${o.user_id}-${o.at}`} className="flex items-center gap-2 rounded-lg bg-elevate px-3 py-2 text-[14px]">
                      <span className="w-11 shrink-0 font-mono font-semibold text-ink">{hhmm(o.at)}</span>
                      <span className="font-semibold text-ink">{memberName(o.user_id)}</span>
                      <span className="text-[12.5px] text-sub">{o.round}차 OT</span>
                      <span className="ml-auto text-[12.5px] text-muted">{nameOf(o.trainer_id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.rereg.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink"><RefreshCw className="h-3.5 w-3.5 text-pt-text" aria-hidden="true" /> 재등록 기회 · 오늘 오는 만료 임박 회원</p>
                <ul className="m-0 list-none space-y-1 p-0">
                  {plan.rereg.map((o) => (
                    <li key={`re-${o.user_id}`} className="flex items-center gap-2 rounded-lg bg-elevate px-3 py-2 text-[14px]">
                      <span className="w-11 shrink-0 font-mono font-semibold text-ink">{hhmm(o.at)}</span>
                      <span className="font-semibold text-ink">{memberName(o.user_id)}</span>
                      <span className="text-[12.5px] text-sub">남은 수업 {o.rem}회</span>
                      <span className="ml-auto text-[12.5px] text-muted">{nameOf(o.trainer_id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.reconnect.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink"><PhoneCall className="h-3.5 w-3.5 text-ot-text" aria-hidden="true" /> 다시 연락할 날 · 보류 회원</p>
                <ul className="m-0 list-none space-y-1 p-0">
                  {plan.reconnect.map((o) => (
                    <li key={`rc-${o.kind}-${o.user_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-elevate px-3 py-2 text-[14px]">
                      <span className="font-semibold text-ink">{memberName(o.user_id)}</span>
                      <span className="text-[12.5px] text-sub">{o.kind === "rereg" ? "재등록 보류" : "OT 보류"}{o.reason ? ` · ${labelOf(o.kind === "rereg" ? REG_REASON_OPTS : CLOSING_REASON_OPTS, o.reason)}` : ""}</span>
                      <span className="ml-auto text-[12.5px] text-muted">{o.date < todayYmd ? `${mdKo(o.date)}부터 밀림` : "오늘"} · {nameOf(o.trainer_id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ③ 이달 · 앞으로 들어올 매출 */}
      <Card as="section">
        <SectionTitle icon={Wallet}>이달 · 앞으로 들어올 매출</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-elevate px-3 py-2.5">
            <span className="block text-[12px] text-muted">이달 매출</span>
            <span className="mt-0.5 block text-[17px] font-bold text-ink">{won(d.month.revenueNet)}</span>
            <span className="block text-[12px] text-sub">신규 {manwon(d.month.newRev ?? 0)} · 재등록 {manwon(d.month.reRev ?? 0)}{d.month.progressPct != null ? ` · 목표 ${d.month.progressPct}%` : ""}</span>
          </div>
          <div className="rounded-xl bg-elevate px-3 py-2.5">
            <span className="block text-[12px] text-muted">이달 등록</span>
            <span className="mt-0.5 block text-[17px] font-bold text-ink">{(d.month.newRegs ?? 0) + (d.month.reRegs ?? 0)}건</span>
            <span className="block text-[12px] text-sub">신규 {d.month.newRegs ?? 0} · 재등록 {d.month.reRegs ?? 0}</span>
          </div>
        </div>
        <p className="mb-1.5 mt-3 text-[13px] font-semibold text-ink">이번 주 등록 · 재등록 후보 <span className="font-normal text-muted">(추정)</span></p>
        {d.pipeline.byTrainer.length === 0 ? (
          <p className="text-[13px] text-muted">이번 주 등록 · 재등록 임박 후보가 없어요.</p>
        ) : (
          <div className="space-y-1.5">
            {d.pipeline.byTrainer.map((r) => (
              <div key={r.trainerId} className="rounded-lg bg-elevate px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-ink">{nameOf(r.trainerId)}</span>
                  <span className="text-[14px] font-bold text-cyan-700">{wonApprox(r.subtotal)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-sub">
                  {d.pipeline.reCandidates.filter((c) => c.trainerId === r.trainerId).map((c) => <span key={"r" + c.user_id}>{memberName(c.user_id)} <span className="text-pt-text">재등록</span></span>)}
                  {d.pipeline.newCandidates.filter((c) => c.trainerId === r.trainerId).map((c) => <span key={"n" + c.user_id}>{memberName(c.user_id)} <span className="text-cyan-700">신규</span></span>)}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 text-[14px]">
              <span className="font-semibold text-ink">성사되면 합계</span>
              <span className="font-bold text-cyan-700">{wonApprox(d.pipeline.grandTotal)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ④ 지금 주의할 회원 */}
      {(d.watchLists.churn.length > 0 || d.watchLists.expiring.length > 0) && (
        <Card as="section">
          <SectionTitle icon={AlertTriangle}>지금 주의할 회원</SectionTitle>
          <ul className="m-0 list-none space-y-1 p-0 text-[14px]">
            {d.watchLists.churn.map((c) => (
              <li key={"c" + c.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[12px] font-semibold text-danger-text">이탈 위험</span>
                <span className="font-semibold text-ink">{memberName(c.user_id)}</span>
                <span className="text-[12.5px] text-muted">{nameOf(c.trainerId)} · 남은 수업 {c.remTotal ?? "—"}회{c.gap != null ? ` · ${c.gap}일째 수업 없음` : ""}</span>
              </li>
            ))}
            {d.watchLists.expiring.map((e) => (
              <li key={"e" + e.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="rounded-md bg-elevate px-1.5 py-0.5 text-[12px] font-semibold text-sub">만료 임박</span>
                <span className="font-semibold text-ink">{memberName(e.user_id)}</span>
                <span className="text-[12.5px] text-muted">{nameOf(e.trainerId)} · 남은 수업 {e.remTotal ?? "—"}회</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ⑤ 오늘 챙길 코칭 */}
      <Card as="section">
        <SectionTitle icon={Sparkles}>오늘 챙길 코칭</SectionTitle>
        {aiState === "loading" ? (
          <p className="text-[13px] text-muted">코칭 작성 중…</p>
        ) : (
          <>
            <ul className="m-0 list-none space-y-1.5 p-0">
              {(aiState === "ready" && ai?.coaching?.length ? ai.coaching : fallbackCoaching(d)).map((c, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700" />{c}</li>
              ))}
            </ul>
            {aiState === "premium" && <p className="mt-2 text-[12.5px] text-muted">AI 코칭은 프리미엄 전용이에요. 기본 코칭을 보여 드렸어요.</p>}
            {aiState === "failed" && aiErr && <p className="mt-2 text-[12.5px] text-sub">{aiErr}</p>}
            {(fallbackCoaching(d).length === 0 && !(ai?.coaching?.length)) && (
              <p className="flex items-center gap-1.5 text-[13px] text-muted"><CheckCircle2 className="h-4 w-4 text-cyan-700" aria-hidden="true" /> 오늘 따로 챙길 코칭이 없어요.</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

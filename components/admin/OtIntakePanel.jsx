"use client";

/* =========================================================================
   대표 'OT 신청 · 배정'(2026-10-06 · 등록·이탈 탭 맨 위) — OT 신청서(QR · 링크)로 들어온 회원.
   ① 배정 대기: 센터 QR로 들어온 신청 → 트레이너를 골라 배정(rpc assign_ot_application → OT 회원 등록 + 그 트레이너 알림)
      · 장난 · 중복이면 넘기기(dismiss). 오래 기다린 신청이 위.
   ② 신청 QR: 센터 QR(보기 · 복사 · 이미지 · 새 링크) + 트레이너별 링크 복사(상담 온 회원에게 배정할 트레이너 링크를 바로 보냄).
   ③ 최근 30일 진행: 신청 → 배정 → 첫 OT 예약 → 1차 OT → 등록 · 트레이너별 숫자.
   데이터: ot_application(대표 SELECT) + admin이 이미 가진 rows · otRows · appts(파생만).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Inbox, QrCode, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { personName } from "@/lib/format";
import { formatSlots } from "@/lib/slots";
import { otHeld } from "@/lib/memberStatus";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import IntakeQr from "@/components/intake/IntakeQr";

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m || 1}분` : m < 1440 ? `${Math.floor(m / 60)}시간` : `${Math.floor(m / 1440)}일`;
};
const phoneFmt = (p) => (p?.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p || "");
const GENDER = { female: "여성", male: "남성" };

const STEP = ["신청", "배정", "첫 OT 예약", "1차 OT", "등록"];

export default function OtIntakePanel({ members = [], otRows = [], appts = [], trainers = [], onChanged }) {
  const { toast, showToast } = useToast();
  const [apps, setApps] = useState(null);
  const [pick, setPick] = useState({});      // app id → trainer id
  const [busyId, setBusyId] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const load = async () => {
    if (!supabase) { setApps([]); return; }
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase.from("ot_application")
      .select("id, source, trainer_id, member_id, duplicate_of, status, name, phone, answers, slots, created_at, assigned_at")
      .or(`status.eq.pending,created_at.gte.${since}`)
      .order("created_at", { ascending: false }).limit(300);
    if (error) { console.error("OT 신청 읽기 실패", error); setApps([]); return; }
    setApps(data || []);
  };
  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, []);

  const active = trainers.filter((t) => t.active !== false);
  const tName = (id) => personName(trainers.find((t) => t.id === id)?.name) || "담당 미정";
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // 진행 단계(0~4) — 배정 뒤 회원 기록에서 파생.
  const stepOf = useMemo(() => {
    const firstAppt = new Map(), held = new Set();
    for (const a of appts) if (a.status !== "canceled" && a.user_id && (!firstAppt.has(a.user_id) || a.start_at < firstAppt.get(a.user_id))) firstAppt.set(a.user_id, a.start_at);
    for (const r of otRows) if (r.ot_round === 1 && otHeld(r)) held.add(r.user_id);
    return (app) => {
      if (app.status !== "assigned" || !app.member_id) return 0;
      const m = memberById.get(app.member_id);
      if (m && (m.status === "pt_active" || otRows.some((r) => r.user_id === m.id && r.closing_result === "success"))) return 4;
      if (held.has(app.member_id)) return 3;
      if (firstAppt.has(app.member_id) && firstAppt.get(app.member_id) >= app.created_at) return 2;
      return 1;
    };
  }, [appts, otRows, memberById]);

  const pending = (apps || []).filter((a) => a.status === "pending").sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const recent = (apps || []).filter((a) => a.status !== "pending" && Date.parse(a.created_at) >= nowMs - 30 * 86400000);
  const byTrainer = useMemo(() => {
    const m = new Map();
    for (const a of recent) {
      if (a.status !== "assigned" || !a.trainer_id) continue;
      const v = m.get(a.trainer_id) || { n: 0, booked: 0, reg: 0 };
      const s = stepOf(a);
      v.n++; if (s >= 2) v.booked++; if (s >= 4) v.reg++;
      m.set(a.trainer_id, v);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [recent, stepOf]);

  const assign = async (app, tid) => {
    if (!tid) { showToast("담당 트레이너를 골라 주세요"); return; }
    setBusyId(app.id);
    try {
      const { error } = await supabase.rpc("assign_ot_application", { p_app: app.id, p_trainer: tid });
      if (error) { console.error("배정 실패", error); showToast("배정하지 못했어요. 다시 시도해 주세요."); return; }
      showToast(`${app.name} 님을 ${tName(tid)} 트레이너에게 배정했어요`);
      await load(); await onChanged?.();
    } finally { setBusyId(null); }
  };
  const dismiss = async (app) => {
    if (!window.confirm(`${app.name} 님 신청을 넘길까요? 회원으로 등록되지 않아요(장난 · 중복 신청일 때).`)) return;
    setBusyId(app.id);
    try {
      const { error } = await supabase.rpc("dismiss_ot_application", { p_app: app.id });
      if (error) { console.error("넘기기 실패", error); showToast("처리하지 못했어요. 다시 시도해 주세요."); return; }
      await load();
    } finally { setBusyId(null); }
  };

  return (
    <Card className="mb-6">
      <SectionTitle icon={UserPlus} aside={apps ? `최근 30일 ${recent.length + pending.length}건` : null}>OT 신청 · 배정</SectionTitle>

      {/* ① 배정 대기 */}
      {apps === null ? <p className="m-0 text-[13px] text-muted">불러오는 중이에요</p> : pending.length === 0 ? (
        <p className="m-0 flex items-center gap-1.5 text-[14px] text-sub"><Inbox className="h-4 w-4" aria-hidden="true" /> 배정을 기다리는 신청이 없어요.</p>
      ) : (
        <div className="space-y-2.5">
          <p className="m-0 text-[14px] font-semibold text-primary-strong">배정 대기 {pending.length}건 · 빨리 배정할수록 첫 OT가 잘 잡혀요</p>
          {pending.map((a) => {
            const ans = a.answers || {};
            const dup = a.duplicate_of ? memberById.get(a.duplicate_of) : null;
            const chosen = pick[a.id] ?? (dup?.trainer_id || "");   // 기존 회원이면 그 담당이 기본
            const facts = [ans.age && `${ans.age}세`, GENDER[ans.gender], ans.goal, ans.exercise_level && `운동 ${ans.exercise_level}`].filter(Boolean);
            return (
              <div key={a.id} className="rounded-xl border border-line bg-elevate p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[16px] font-bold text-ink">{a.name}</span>
                  <span className={`text-[13px] font-semibold ${nowMs - Date.parse(a.created_at) > 86400000 ? "text-danger-text" : "text-sub"}`}>{ago(a.created_at)} 기다림</span>
                </div>
                <div className="mt-0.5 text-[13.5px] text-sub"><a href={`tel:${a.phone}`} className="font-mono text-ink underline-offset-2 hover:underline">{phoneFmt(a.phone)}</a>{facts.length ? ` · ${facts.join(" · ")}` : ""}</div>
                <div className="mt-0.5 text-[13.5px] text-ink">원하는 시간 · {formatSlots(a.slots) || "안 남김"}</div>
                {ans.member_note && <div className="mt-0.5 text-[13px] text-sub">&ldquo;{ans.member_note}&rdquo;</div>}
                {dup && <div className="mt-1 text-[13px] font-semibold text-ot-text">이미 등록된 회원이에요(담당 {tName(dup.trainer_id)}). 배정하면 새로 만들지 않고 그 회원에 연결돼요.</div>}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select value={chosen} onChange={(e) => setPick((p) => ({ ...p, [a.id]: e.target.value }))}
                    aria-label="담당 트레이너" className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-[14px] text-ink outline-none focus:border-primary">
                    <option value="">담당 트레이너 고르기</option>
                    {active.map((t) => <option key={t.id} value={t.id}>{personName(t.name)}{t.role === "owner" ? " (대표)" : ""}</option>)}
                  </select>
                  <button type="button" disabled={busyId === a.id} onClick={() => assign(a, chosen)}
                    className="min-h-[44px] rounded-xl bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-40">
                    배정
                  </button>
                  <button type="button" disabled={busyId === a.id} onClick={() => dismiss(a)} className="min-h-[44px] px-2 text-[13px] font-semibold text-sub hover:text-ink">넘기기</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ② 신청 QR · 링크 */}
      <details className="group mt-5 border-t border-line pt-4" open={qrOpen} onToggle={(e) => setQrOpen(e.currentTarget.open)}>
        <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 text-[15px] font-bold text-ink [&::-webkit-details-marker]:hidden">
          <QrCode className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 신청 QR · 링크
          <ChevronDown className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        {qrOpen && (
          <div className="mt-2 space-y-4">
            <div>
              <p className="m-0 mb-2 text-[13.5px] leading-relaxed text-sub"><b className="font-semibold text-ink">센터 QR</b> · 카운터 · 포스터 · 인스타용. 제출하면 여기 &lsquo;배정 대기&rsquo;로 와요.</p>
              <IntakeQr trainerId={null} label="센터" showToast={showToast} />
            </div>
            <div>
              <p className="m-0 mb-2 text-[13.5px] leading-relaxed text-sub"><b className="font-semibold text-ink">트레이너 링크</b> · 상담 온 회원에게 배정할 트레이너 링크를 보내면, 제출하는 순간 그 트레이너에게 바로 등록돼요.</p>
              <div className="divide-y divide-line rounded-xl border border-line">
                {active.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                    <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{personName(t.name)}{t.role === "owner" ? " (대표)" : ""}</span>
                    <IntakeQr trainerId={t.id} label={personName(t.name)} compact showToast={showToast} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </details>

      {/* ③ 최근 30일 진행 */}
      {recent.length > 0 && (
        <details className="group mt-3 border-t border-line pt-4">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 text-[15px] font-bold text-ink [&::-webkit-details-marker]:hidden">
            최근 30일 진행 <span className="text-[13px] font-normal text-sub">신청 {recent.length}건</span>
            <ChevronDown className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          {byTrainer.length > 0 && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {byTrainer.map(([tid, v]) => (
                <div key={tid} className="rounded-xl bg-elevate px-3.5 py-2.5 text-[13.5px] text-sub">
                  <b className="text-[14px] text-ink">{tName(tid)}</b> · 받은 신청 {v.n} · 첫 OT 예약 {v.booked} · 등록 {v.reg}
                </div>
              ))}
            </div>
          )}
          <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
            {recent.map((a) => {
              const s = stepOf(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-1 py-1 text-[13.5px]">
                  <span className="min-w-0 text-ink"><b className="font-semibold">{a.name}</b> <span className="text-sub">· {a.source === "center" ? "센터 QR" : "트레이너 링크"}{a.trainer_id ? ` · ${tName(a.trainer_id)}` : ""}</span></span>
                  <span className={`shrink-0 font-semibold ${a.status === "dismissed" ? "text-muted" : s >= 4 ? "text-primary-strong" : "text-sub"}`}>
                    {a.status === "dismissed" ? "넘김" : STEP[s]}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <Toast message={toast} />
    </Card>
  );
}

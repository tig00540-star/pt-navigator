"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  ChevronRight,
  Search,
  ShieldCheck,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import ObservationTab from "@/components/tabs/ObservationTab";
import SecondOTTab from "@/components/tabs/SecondOTTab";
import FirstOTTab from "@/components/tabs/FirstOTTab";
import MemberViewShell from "@/components/views/MemberViewShell";
import ScheduleBoard from "@/components/views/ScheduleBoard";
import MyStats from "@/components/views/MyStats";
import PtConfirmBanner from "@/components/views/PtConfirmBanner";
import TodoTab from "@/components/views/TodoTab";
import AnnouncementGate from "@/components/AnnouncementGate";
import { viewFor, initialStatus, toPtActive, buildContract } from "@/lib/memberStatus";
import MemberBadge, { viewMeta } from "@/components/ui/MemberBadge";

/* =========================================================================
   HARDCODED DATA  —  1차 OT 세일즈 네비게이터
   ========================================================================= */

const DEMO_MEMBER = {
  name: "김철수",
  age: 34,
  job: "IT 개발자",
  residence: "센터 인근 오피스텔",
  mbti: "ISTJ",
  pain: "우측 무릎 통증",
  goal: "바디프로필",
  status: "ot_active", // ② member_status — 라이프사이클 상태
  origin: "ot_funnel", // ② 진입 문 (ot_funnel | handover | external)
  pt_direction: "고관절 가동성 회복 + 무릎 부하 분산 (데모)", // PT 살아있는 방향축(③)
  summary: [
    "논리와 근거로 움직이는 실용주의자 — '왜'가 해결되면 즉시 실행에 옮기는 결과지향형.",
    "장시간 좌식 근무로 고관절 굴곡근 단축 추정 → 우측 무릎에 누적 부하가 걸릴 구조.",
    "목표(바디프로필)가 명확 → 감성 어필보다 수치·마일스톤·역산 계획에 강하게 반응.",
  ],
};

/* Supabase user_table 한 행 → 화면이 기대하는 회원 형태로 매핑 */
function mapMemberRow(r) {
  return {
    id: r.id,
    name: r.name,
    age: r.age ?? "-",
    job: r.job ?? "-",
    residence: r.residence ?? "-",
    mbti: r.mbti ?? "-",
    pain: r.pain ?? "-",
    goal: r.goal ?? "미설정",
    machines: r.machines ?? [],
    trainer_id: r.trainer_id ?? null,   // 내 회원 판별(원장 스코프)
    // ② member_status — 컬럼 미반영(마이그레이션 전)·demo 행에서도 기본값으로 안전.
    status: r.status ?? "ot_active",
    origin: r.origin ?? "ot_funnel",
    pt_direction: r.pt_direction ?? "", // PT 현재 방향/목표(③ 인라인 편집)
    status_changed_at: r.status_changed_at ?? null,
    status_note: r.status_note ?? null,
    summary: r.name === DEMO_MEMBER.name
      ? DEMO_MEMBER.summary
      : ["AI 성향 요약은 회원 데이터를 바탕으로 곧 생성됩니다."],
  };
}

/* ---- 탭 메타 ---- */
const TABS = [
  { id: 9, label: "스케줄", always: true },
  { id: 13, label: "할일", always: true },
  { id: 0, label: "회원", always: true },
  { id: 10, label: "운동일지", pt: true },
  { id: 11, label: "재등록", pt: true },
  { id: 12, label: "인바디", pt: true },
  { id: 1, label: "1차 OT", ot: true },
  { id: 5, label: "1차 피드백", ot: true },
  { id: 2, label: "2차 OT", ot: true },
  { id: 8, label: "내 실적", always: true },
];

/* =========================================================================
   PURGE-SAFE COLOR TOKENS
   ========================================================================= */

const C = {
  sky: {
    text: "text-sky-400",
    soft: "bg-sky-500/10",
    border: "border-sky-500/30",
    ring: "ring-sky-500/50",
    dot: "bg-sky-400",
    bar: "bg-sky-400",
    glow: "shadow-sky-500/20",
  },
  lime: {
    text: "text-lime-400",
    soft: "bg-lime-500/10",
    border: "border-lime-500/30",
    ring: "ring-lime-500/50",
    dot: "bg-lime-400",
    bar: "bg-lime-400",
    glow: "shadow-lime-500/20",
  },
  orange: {
    text: "text-orange-400",
    soft: "bg-orange-500/10",
    border: "border-orange-500/30",
    ring: "ring-orange-500/50",
    dot: "bg-orange-400",
    bar: "bg-orange-400",
    glow: "shadow-orange-500/20",
  },
  emerald: {
    text: "text-emerald-400",
    soft: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/50",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    glow: "shadow-emerald-500/20",
  },
};

/* =========================================================================
   SMALL PIECES
   ========================================================================= */


/* =========================================================================
   TAB 2  —  2차 OT 내비게이터
   ========================================================================= */

/* =========================================================================
   신규 회원 사전 정보 등록 폼 (모달)
   ========================================================================= */

function MemberForm({ machineOptions, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    job: "",
    residence: "",
    mbti: "",
    pain: "",
    goal: "",
    origin: "ot_funnel", // ② 진입 문 — status는 여기서 파생(손으로 status 안 고름 · §7)
    carrySessions: "", // 인계·외부(handover/external)만 — 이월 잔여 세션
    carryPrice: "", // 이월 회당단가(급여 원천이라 인계도 보존 · 매출 제외는 buildContract)
  });
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleMachine = (label) =>
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));

  const save = async () => {
    if (!form.name.trim()) {
      setErr("이름은 필수입니다.");
      return;
    }
    if (!supabase) {
      setErr("Supabase가 아직 설정되지 않았어요. .env.local의 키를 확인하세요.");
      return;
    }
    // 인계·외부는 이월 잔여가 필요 — user INSERT 전에 검증(잘못된 등록 방지).
    const isCarry = form.origin !== "ot_funnel";
    if (isCarry && !(Number(form.carrySessions) > 0 && Number(form.carryPrice) > 0)) {
      setErr("인계·외부 등록은 남은 세션수·회당단가가 필요합니다");
      return;
    }
    setSaving(true);
    setErr("");
    const { data: u, error } = await supabase
      .from("user_table")
      .insert({
        name: form.name.trim(),
        age: form.age ? Number(form.age) : null,
        job: form.job || null,
        residence: form.residence || null,
        mbti: form.mbti || null,
        pain: form.pain || null,
        goal: form.goal || null,
        machines: picked,
        origin: form.origin,
        status: initialStatus(form.origin), // ot_funnel→ot_active, 그 외→pt_active(PT 직행 §1.5)
        status_changed_at: new Date().toISOString(),
      })
      .select(); // 새 회원 id를 받아 이월계약에 연결
    if (error || !u || u.length === 0) {
      setSaving(false);
      setErr(error ? error.message : "등록 실패(0행)");
      return;
    }
    // 이월계약 INSERT (handover/external만) — 실패해도 회원은 등록됨(PT 뷰 '계약 등록'으로 회복).
    if (isCarry) {
      const payload = buildContract({
        userId: u[0].id,
        origin: form.origin, // handover/external → counts_as_revenue=false(매출 제외)
        sessions_total: Number(form.carrySessions),
        price_per_session: Number(form.carryPrice),
        amount_total: null, // 이월은 매출 아님
        service_sessions: 0,
      });
      const { data: c, error: cErr } = await supabase
        .from("session_log")
        .insert(payload)
        .select();
      if (cErr || !c || c.length === 0) {
        setSaving(false);
        setErr("회원은 등록됐지만 이월계약 저장 실패 — PT 뷰의 '계약 등록'으로 마저 등록하세요");
        return;
      }
    }
    setSaving(false);
    onSaved();
  };

  const fields = [
    { k: "name", label: "이름", ph: "김철수" },
    { k: "age", label: "나이", ph: "34", type: "number" },
    { k: "job", label: "직업", ph: "IT 개발자" },
    { k: "residence", label: "거주지", ph: "센터 인근 오피스텔" },
    { k: "mbti", label: "MBTI", ph: "ISTJ" },
    { k: "pain", label: "불편 부위", ph: "우측 무릎 통증" },
    { k: "goal", label: "목적", ph: "바디프로필" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary-strong" />
            <h2 className="text-base font-semibold text-ink">신규 회원 사전 정보 등록</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-elevate hover:text-ink"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.k} className={f.k === "name" ? "col-span-2" : ""}>
              <label className="mb-1 block text-[11px] font-medium text-muted">
                {f.label}
                {f.k === "name" && <span className="text-primary-strong"> *</span>}
              </label>
              <input
                type={f.type || "text"}
                value={form[f.k]}
                onChange={set(f.k)}
                placeholder={f.ph}
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>

        {/* ② 진입 문(origin) — status는 여기서 파생. status 드롭다운은 만들지 않음(§7). */}
        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-medium text-muted">등록 유형</label>
          <select
            value={form.origin}
            onChange={set("origin")}
            className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="ot_funnel">신규 (OT 진행)</option>
            <option value="handover">인계받은 PT</option>
            <option value="external">외부 PT 등록</option>
          </select>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            인계·외부 PT는 OT 없이 바로 PT 뷰로 시작합니다(§1.5). 상태는 자동 결정.
          </p>
        </div>

        {/* 이월 계약 — handover/external만. ot_funnel은 계약을 ① PT 확정 때 생성. */}
        {form.origin !== "ot_funnel" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">남은 세션수 *</span>
              <input
                type="number"
                value={form.carrySessions}
                onChange={set("carrySessions")}
                placeholder="20"
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">회당단가(원) *</span>
              <input
                type="number"
                value={form.carryPrice}
                onChange={set("carryPrice")}
                placeholder="50000"
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </label>
            <p className="col-span-2 text-[10px] text-muted">
              인계·외부 PT는 이월 계약으로 잔여가 잡힙니다(매출 제외).
            </p>
          </div>
        )}

        {/* 보유머신 */}
        <div className="mt-3">
          <label className="mb-1.5 block text-[11px] font-medium text-muted">
            보유머신 {machineOptions.length === 0 && "(center_machine 시드 필요)"}
          </label>
          <div className="flex flex-wrap gap-2">
            {machineOptions.map((label) => {
              const on = picked.includes(label);
              return (
                <button
                  key={label}
                  onClick={() => toggleMachine(label)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-primary bg-primary-soft text-primary-strong"
                      : "border-line bg-elevate text-muted hover:border-primary"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
            {err}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line bg-elevate py-2.5 text-sm font-medium text-sub transition hover:border-primary"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition active:scale-95 disabled:opacity-60"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   회원 목록 (전용 탭)
   ========================================================================= */

function MemberListTab({ members, selectedId, onSelect, onAdd, uid }) {
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("all"); // all | ot | pt | inactive
  // 원장 = 본인 것 아닌 회원이 보임(RLS상 trainer는 본인 것만 → 토글 불필요).
  const isOwner = members.some((m) => m.trainer_id && uid && m.trainer_id !== uid);
  const [mineOnly, setMineOnly] = useState(true); // 기본 '내 회원'
  const scoped = isOwner && mineOnly ? members.filter((m) => m.trainer_id === uid) : members;

  // 세그먼트 인원수 + 세그먼트 base(all=보관 제외). 검색은 그 위 AND.
  const counts = { ot: 0, pt: 0, inactive: 0 };
  for (const m of scoped) {
    const v = viewFor(m);
    if (v in counts) counts[v] += 1;
  }
  const totalActive = counts.ot + counts.pt; // 전체 = inactive 제외
  const bySegment = scoped.filter((m) => {
    const v = viewFor(m);
    return segment === "all" ? v !== "inactive" : v === segment;
  });
  const list = q.trim()
    ? bySegment.filter((m) =>
        `${m.name} ${m.job}`.toLowerCase().includes(q.trim().toLowerCase())
      )
    : bySegment;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회원 검색 (이름·직업)"
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-ink placeholder-muted shadow-sm outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={onAdd}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 transition active:scale-95"
        >
          <UserPlus className="h-4 w-4" /> 등록
        </button>
      </div>

      {isOwner && (
        <div className="mb-3 flex gap-1.5">
          {[{ k: true, l: "내 회원" }, { k: false, l: "전체" }].map((t) => (
            <button
              key={String(t.k)}
              onClick={() => setMineOnly(t.k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mineOnly === t.k
                  ? "border border-primary/30 bg-primary-soft text-primary-strong"
                  : "border border-line bg-card text-muted hover:text-ink"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-1.5">
        {[
          { key: "all", label: "전체", n: totalActive },
          { key: "ot", label: "OT", n: counts.ot },
          { key: "pt", label: "PT", n: counts.pt },
          { key: "inactive", label: "보관", n: counts.inactive },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSegment(s.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              segment === s.key
                ? "bg-primary-soft text-primary-strong ring-1 ring-primary/30"
                : "bg-elevate text-muted hover:text-ink"
            }`}
          >
            {s.label} {s.n}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center shadow-sm">
          <User className="mx-auto h-8 w-8 text-line" />
          <p className="mt-3 text-sm text-sub">
            {members.length === 0
              ? "아직 등록된 회원이 없어요."
              : q.trim()
              ? "검색 결과가 없어요."
              : "이 그룹에 회원이 없어요."}
          </p>
          {members.length === 0 && (
            <button
              onClick={onAdd}
              className="mt-4 rounded-lg border border-line bg-elevate px-4 py-2 text-xs font-medium text-sub transition hover:border-primary"
            >
              첫 회원 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => {
            const on = m.id === selectedId;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`group flex items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition ${
                  on
                    ? "border-primary bg-primary-soft"
                    : "border-line bg-card hover:border-primary"
                }`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-sm font-bold ${viewMeta(viewFor(m)).avatar}`}>
                  {m.name ? m.name.slice(0, 1) : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{m.name}</span>
                    <MemberBadge view={viewFor(m)} />
                    <span className="font-mono text-xs text-muted">{m.age}세</span>
                    {on && (
                      <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">
                        선택됨
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-sub">{m.job}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded bg-elevate px-1.5 py-0.5 text-[10px] text-sub">
                      {m.mbti}
                    </span>
                    <span className="rounded bg-elevate px-1.5 py-0.5 text-[10px] text-sub">
                      {m.pain}
                    </span>
                    <span className="rounded bg-elevate px-1.5 py-0.5 text-[10px] text-sub">
                      목표 {m.goal}
                    </span>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted group-hover:text-primary-strong" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   MAIN
   ========================================================================= */

export default function OTNavigatorDashboard() {
  const [tab, setTab] = useState(9);

  // --- Supabase 연동 상태 ---
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [machineOptions, setMachineOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [dbNote, setDbNote] = useState("");
  // 클로징 저장(1·2차) 성공 시 증가 → PtConfirmBanner가 ot_log 재조회(같은 회원 stale 방지).
  // ⚠️ ③에서 클로징 저장 지점(재등록·이탈 UI 등)이 늘면 그 성공 지점에도 onClosingSaved를 물려야 함.
  const [closingVersion, setClosingVersion] = useState(0);
  const [myUid, setMyUid] = useState(null); // 현재 로그인 uid — 내 회원 판별(원장 스코프)
  const [bellOpen, setBellOpen] = useState(false);   // 공지 재열람(벨) 모달
  const [unreadCount, setUnreadCount] = useState(0); // 공지 안읽음 배지 수

  const loadMembers = async () => {
    if (!supabase) {
      setDbNote("데모 모드 — Supabase 키를 설정하면 실데이터가 연결됩니다.");
      return;
    }
    const { data, error } = await supabase
      .from("user_table")
      .select("*")
      .eq("hidden", false)                       // 소프트 삭제(환불) 회원 제외
      .order("created_at", { ascending: false });
    if (error) {
      setDbNote("불러오기 실패: " + error.message);
      return;
    }
    const mapped = (data || []).map(mapMemberRow);
    setMembers(mapped);
    setDbNote("");
    setSelectedId((prev) => prev ?? (mapped[0] ? mapped[0].id : null));
  };

  const loadMachines = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("center_machine").select("*");
    setMachineOptions((data || []).map((m) => `${m.brand} ${m.name}`));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
    loadMachines();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setMyUid(data?.user?.id ?? null));
  }, []);

  // DB 회원이 있으면 선택된 회원을, 없으면 데모 회원을 렌더
  const member =
    members.find((m) => m.id === selectedId) || members[0] || DEMO_MEMBER;

  // ② 라이프사이클 뷰 — 매핑은 memberStatus 모듈에만(여기선 status 직접 비교 X).
  const view = viewFor(member);

  // 교차 전환 보정 — 회원 view와 안 맞는 타입 탭이면 그 뷰 홈탭으로(blank·하이라이트 누락 방지).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (view === "pt" && (tab === 1 || tab === 2 || tab === 5)) setTab(10);
    else if (view === "ot" && (tab === 10 || tab === 11 || tab === 12)) setTab(1);
  }, [view, tab]);

  // 로컬 member status 갱신(낙관적/롤백용).
  const setMemberStatus = (id, status) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));

  // 로컬 member 임의 필드 갱신(낙관적) — PTView 방향 편집 등 저장 성공 후 반영.
  const onMemberPatch = (id, patch) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // 수동 'PT 등록 확정' — 계약(session_log) INSERT + status 전이(둘 다 .select() 하드닝). boolean 반환(모달이 소비).
  const confirmPtActive = async (contractInput) => {
    if (!supabase) {
      setMemberStatus(member.id, "pt_active"); // 데모: 로컬만
      return true;
    }
    // 1) 멱등 가드 — 이미 계약 있으면(재시도) INSERT 스킵.
    const { data: existing } = await supabase
      .from("session_log")
      .select("id")
      .eq("user_id", member.id)
      .limit(1);
    const hasContract = (existing?.length ?? 0) > 0;
    // 2) 계약 INSERT (없을 때만) — .select() 하드닝.
    if (!hasContract) {
      const payload = buildContract({ userId: member.id, origin: member.origin, kind: "new", ...contractInput });
      const { data: ins, error: insErr } = await supabase
        .from("session_log")
        .insert(payload)
        .select();
      if (insErr || !ins || ins.length === 0) {
        setDbNote(
          "계약 생성 실패 — session_log INSERT (정책/0행)" + (insErr ? ": " + insErr.message : "")
        );
        return false; // status 안 건드림(clean)
      }
    }
    // 3) status 전이 — .select() 하드닝. 실패해도 계약은 남을 수 있음 → 재시도 시 (1)이 스킵(멱등).
    const { data, error } = await supabase
      .from("user_table")
      .update(toPtActive(member))
      .eq("id", member.id)
      .select();
    if (error || !data || data.length === 0) {
      setDbNote(
        "PT 등록 확정 실패 — user_table UPDATE (정책/0행)" + (error ? ": " + error.message : "")
      );
      return false;
    }
    setMemberStatus(member.id, "pt_active"); // 확정 성공 후에만 뷰 전환(깜빡임 방지)
    return true;
  };



  return (
    <div className="min-h-screen bg-bg pb-28 text-ink antialiased selection:bg-primary/20">
      {/* 공지 — 게이트(필수확인 강제) + 재열람(벨). gateList 0·!supabase·uid null이면 오버레이 없음. */}
      <AnnouncementGate
        uid={myUid}
        onUnreadCount={setUnreadCount}
        reviewOpen={bellOpen}
        onCloseReview={() => setBellOpen(false)}
      />
      {/* ================= TOP BAR ================= */}
      <header className="sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 shadow-lg shadow-lime-500/30">
                <Activity className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-strong">
                  OT Navigator
                </div>
                <div className="text-sm font-semibold text-ink">
                  {member.name}
                  <span className="font-normal text-muted"> · 세일즈 네비게이터</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {members.length > 0 && (
                <select
                  value={selectedId || ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="max-w-[110px] rounded-lg border border-line bg-elevate px-2 py-1.5 text-xs text-sub outline-none focus:border-primary sm:max-w-[130px]"
                  aria-label="회원 선택"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-2.5 py-1.5 text-xs font-medium text-sub transition hover:border-primary hover:text-primary-strong active:scale-95"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">신규 등록</span>
              </button>

              <button
                onClick={() => setBellOpen(true)}
                className="relative flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-2.5 py-1.5 text-xs font-medium text-sub transition hover:border-primary hover:text-primary-strong active:scale-95"
                aria-label="공지"
              >
                <Bell className="h-3.5 w-3.5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              <a
                href="/admin"
                className="flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-700 transition hover:border-fuchsia-500/60 active:scale-95"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">관리자</span>
              </a>
            </div>
          </div>

          {/* 탭 네비게이션 — 상시(스케줄·회원) + OT 뷰에서만 OT 탭 노출(§7) */}
          <nav className="-mb-px flex gap-1 overflow-x-auto whitespace-nowrap">
            {TABS.filter((t) => t.always || (t.ot && view === "ot") || (t.pt && view === "pt")).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${
                  tab === t.id ? "text-primary-strong" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {dbNote && (
        <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
          <div className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-sub shadow-sm">
            {dbNote}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {tab === 9 ? (
          <div className="tab-anim"><ScheduleBoard members={members} /></div>
        ) : tab === 13 ? (
          <div className="tab-anim">
            <TodoTab
              members={members}
              uid={myUid}
              onSelect={(id, toTab) => { setSelectedId(id); setTab(toTab ?? 1); }}
            />
          </div>
        ) : tab === 8 ? (
          <div className="tab-anim"><MyStats members={members} /></div>
        ) : (
          <>
        {/* OT 회원 + 클로징 성공 시 '수동 PT 등록 확정' 배너(자체 게이트) */}
        {view === "ot" && (
          <PtConfirmBanner
            member={member}
            onConfirm={confirmPtActive}
            closingVersion={closingVersion}
          />
        )}
        {/* viewFor(member)로 뷰 스위치. 'ot'면 아래 6탭 그대로, 그 외는 PT/inactive 뷰. */}
        <MemberViewShell member={member} tab={tab} onGoList={() => setTab(0)} showList={tab === 0} onMemberPatch={onMemberPatch} onMembersChanged={loadMembers}>
          {tab === 0 && (
            <div className="tab-anim">
            <MemberListTab
              members={members}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setTab(1);
              }}
              onAdd={() => setShowForm(true)}
              uid={myUid}
            />
            </div>
          )}

          {tab === 1 && (
            <div className="tab-anim"><FirstOTTab member={member} /></div>
          )}

          {tab === 2 && (
            <div className="tab-anim">
            <SecondOTTab
              member={member}
              onClosingSaved={() => setClosingVersion((v) => v + 1)}
            />
            </div>
          )}
          {tab === 5 && (
            <div className="tab-anim">
            <ObservationTab
              member={member}
              onClosingSaved={() => setClosingVersion((v) => v + 1)}
            />
            </div>
          )}
        </MemberViewShell>
          </>
        )}
      </main>


      {/* ================= 신규 회원 등록 모달 ================= */}
      {showForm && (
        <MemberForm
          machineOptions={machineOptions}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadMembers();
          }}
        />
      )}
    </div>
  );
}

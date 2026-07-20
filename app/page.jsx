"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Pencil,
  Search,
  ShieldCheck,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAccount } from "@/lib/useAccount";
import { won, hasVal } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import ObservationTab from "@/components/tabs/ObservationTab";
import SecondOTTab from "@/components/tabs/SecondOTTab";
import FirstOTTab from "@/components/tabs/FirstOTTab";
import MemberViewShell from "@/components/views/MemberViewShell";
import MemberEditForm from "@/components/views/MemberEditForm";
import ChurnRiskToday from "@/components/views/ChurnRiskToday";
import ScheduleBoard from "@/components/views/ScheduleBoard";
import MyStats from "@/components/views/MyStats";
import SettingsView, { SETTINGS_SUBTABS } from "@/components/views/SettingsView";
import PtConfirmBanner from "@/components/views/PtConfirmBanner";
import TodoTab from "@/components/views/TodoTab";
import AnnouncementGate from "@/components/AnnouncementGate";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import FilterChip from "@/components/ui/FilterChip";
import Modal from "@/components/ui/Modal";
import BottomNav from "@/components/ui/BottomNav";
import Wordmark from "@/components/ui/Wordmark";
import NumberInput from "@/components/ui/NumberInput";
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
    phone_number: r.phone_number ?? null,
    age: r.age ?? "-",
    job: r.job ?? "-",
    residence: r.residence ?? "-",
    mbti: r.mbti ?? "-",
    pain: r.pain ?? "-",
    goal: r.goal ?? "미설정",
    // OT 사전 문진 — firstPrompt 입력용(빈 값은 g()가 '없음' 처리). 화면 렌더엔 미사용.
    goal_deadline: r.goal_deadline ?? null,
    training_pace: r.training_pace ?? null,
    injury_history: r.injury_history ?? null,
    exercise_level: r.exercise_level ?? null,
    quit_reason: r.quit_reason ?? null,
    past_exercise: r.past_exercise ?? null,
    availability: r.availability ?? null,
    activity_level: r.activity_level ?? null,
    member_note: r.member_note ?? null,
    machines: r.machines ?? [],
    trainer_id: r.trainer_id ?? null,   // 내 회원 판별(원장 스코프)
    member_token: r.member_token ?? null,     // 회원앱 링크 토큰(S3 발급 UI)
    member_auth_id: r.member_auth_id ?? null, // 회원 auth 연결(있으면 '연결됨' = 1회+ 로그인)
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

/* ---- 탭 메타 ----
   글로벌 3탭(오늘·회원·내실적)은 왼쪽 고정·위치 불변(근육기억).
   회원 워크플로우 탭은 view(ot/pt)에 따라 그 오른쪽에 묶여 붙는다(group=색·구분선).
   id는 기존 값 재사용: 9=오늘(옛 스케줄, 할일 흡수)·13(옛 할일 단독)은 폐지. */
const TABS = [
  { id: 9,  label: "오늘",     always: true },              // 스케줄 보드 + 오늘 할일 스택
  { id: 0,  label: "회원",     always: true },
  { id: 8,  label: "내 실적",  always: true },
  { id: 7,  label: "설정",     always: true },              // 트레이너 설정 모음(목표·프로필·라이브러리·가격·계정)
  { id: 1,  label: "1차 OT 준비", ot: true, group: "ot" },    // FirstOTTab
  { id: 5,  label: "1차 피드백", ot: true, group: "ot" },      // ObservationTab
  { id: 2,  label: "2차 OT 준비", ot: true, group: "ot" },     // SecondOTTab
  { id: 10, label: "회원자료", pt: true, group: "pt" },
  { id: 12, label: "자료남기기", pt: true, group: "pt" },
  { id: 11, label: "재등록 준비", pt: true, group: "pt" },
];

/* 회원 워크플로우 탭 그룹 색(purge-safe · 정적) — OT=amber, PT=sky */
const GROUP_TAB = {
  ot: { active: "text-amber-600", idle: "text-amber-700/60 hover:text-amber-700", bar: "bg-amber-500" },
  pt: { active: "text-sky-600",   idle: "text-sky-700/60 hover:text-sky-700",     bar: "bg-sky-500" },
  settings: { active: "text-primary-strong", idle: "text-primary-strong/60 hover:text-primary-strong", bar: "bg-primary" },
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

function MemberForm({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    phone_number: "",
    age: "",
    job: "",
    residence: "",
    mbti: "",
    pain: "",
    goal: "",
    goal_deadline: "",
    training_pace: "",
    injury_history: "",
    exercise_level: "",
    quit_reason: "",
    past_exercise: "",
    availability: "",
    activity_level: "",
    member_note: "",
    origin: "ot_funnel", // ② 진입 문 — status는 여기서 파생(손으로 status 안 고름 · §7)
    carrySessions: "", // 인계·외부(handover/external)만 — 이월 잔여 세션
    carryPrice: "", // 이월 회당단가(급여 원천이라 인계도 보존 · 매출 제외는 buildContract)
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
    try {
    const { data: u, error } = await supabase
      .from("user_table")
      .insert({
        name: form.name.trim(),
        phone_number: form.phone_number.trim() || null,
        age: form.age ? Number(form.age) : null,
        job: form.job || null,
        residence: form.residence || null,
        mbti: form.mbti || null,
        pain: form.pain || null,
        goal: form.goal || null,
        goal_deadline: form.goal_deadline || null,
        training_pace: form.training_pace || null,
        injury_history: form.injury_history || null,
        exercise_level: form.exercise_level || null,
        quit_reason: form.quit_reason || null,
        past_exercise: form.past_exercise || null,
        availability: form.availability || null,
        activity_level: form.activity_level || null,
        member_note: form.member_note || null,
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
    } catch {
      setErr("등록 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      return;
    } finally {
      setSaving(false);
    }
    onSaved();
  };

  const fields = [
    { k: "name", label: "이름", ph: "김철수" },
    { k: "phone_number", label: "휴대폰 번호 (회원앱 로그인용)", ph: "010-1234-5678", type: "tel" },
    { k: "age", label: "나이", ph: "34", type: "number" },
    { k: "job", label: "직업", ph: "IT 개발자" },
    { k: "residence", label: "거주지", ph: "센터 인근 오피스텔" },
    { k: "mbti", label: "MBTI", ph: "ISTJ" },
    { k: "pain", label: "불편 부위", ph: "우측 무릎 통증" },
    { k: "goal", label: "목적", ph: "바디프로필" },
    { k: "goal_deadline",  label: "목표 시점·계기",  ph: "예: 8월 결혼 / 없으면 비움" },
    { k: "training_pace",  label: "원하는 페이스",    ph: "가볍게 / 제대로 / 집중해서" },
    { k: "injury_history", label: "부상·수술 이력",  ph: "없음 / 2년 전 무릎 수술 등" },
    { k: "exercise_level", label: "운동 경험",        ph: "처음 / 가끔 / 꾸준히" },
    { k: "quit_reason",    label: "예전 중단 이유",   ph: "시간·동기·효과·부상·혼자 막막 등" },
    { k: "past_exercise",  label: "받아본 유료 운동", ph: "PT, 필라테스 등 / 없음" },
    { k: "availability",   label: "가능 빈도·시간대", ph: "주 2회 · 저녁" },
    { k: "activity_level", label: "하루 활동량",      ph: "주로 앉아서 / 활동적" },
    { k: "member_note",    label: "바라는 점(선택)",  ph: "회원이 미리 남긴 말" },
  ];

  return (
    <Modal variant="center" onClose={onClose}>
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

        {/* 폰 1열 — 긴 한글 라벨("휴대폰 번호 (회원앱 로그인용)")이 2줄이 되면 옆 칸과 세로가 어긋나 계단처럼 밀렸다.
            sm+에서만 2열(레포 참고 구현: MemberListTab·ObservationTab·admin의 sm:grid-cols-2). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.k} className={f.k === "name" ? "sm:col-span-2" : ""}>
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
            인계·외부 PT는 OT 없이 바로 PT 뷰로 시작합니다. 상태는 자동 결정.
          </p>
        </div>

        {/* 이월 계약 — handover/external만. ot_funnel은 계약을 ① PT 확정 때 생성. */}
        {form.origin !== "ot_funnel" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">남은 세션수 *</span>
              <NumberInput
                value={form.carrySessions}
                onValueChange={(v) => setForm((f) => ({ ...f, carrySessions: v }))}
                placeholder="20"
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">회당단가(원) *</span>
              <NumberInput
                value={form.carryPrice}
                onValueChange={(v) => setForm((f) => ({ ...f, carryPrice: v }))}
                placeholder="50000"
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </label>
            <p className="sm:col-span-2 text-[10px] text-muted">
              인계·외부 PT는 이월 계약으로 잔여가 잡힙니다(매출 제외).
            </p>
          </div>
        )}


        {err && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
            {err}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" size="md" onClick={onClose} className="flex-1">
            취소
          </Button>
          <Button variant="primary" size="md" onClick={save} disabled={saving} className="flex-1">
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
    </Modal>
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
        <Button variant="primary" size="md" onClick={onAdd} className="shrink-0">
          <UserPlus className="h-4 w-4" /> 등록
        </Button>
      </div>

      {isOwner && (
        <div className="mb-3 flex gap-1.5">
          {[{ k: true, l: "내 회원" }, { k: false, l: "전체" }].map((t) => (
            <FilterChip
              key={String(t.k)}
              selected={mineOnly === t.k}
              onClick={() => setMineOnly(t.k)}
            >
              {t.l}
            </FilterChip>
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
            <Button variant="ghost" size="sm" onClick={onAdd} className="mt-4">
              첫 회원 등록하기
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => {
            const on = m.id === selectedId;
            const goalSet = hasVal(m.goal) && m.goal !== "미설정";
            return (
              <Card
                as="button"
                key={m.id}
                onClick={() => onSelect(m.id)}
                interactive
                selected={on}
                padding="sm"
                className="group flex items-start gap-3 text-left"
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-sm font-bold ${viewMeta(viewFor(m)).avatar}`}>
                  {m.name ? m.name.slice(0, 1) : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{m.name}</span>
                    <MemberBadge view={viewFor(m)} />
                    {hasVal(m.age) && <span className="font-mono text-xs text-muted">{m.age}세</span>}
                    {on && <Badge tone="primary">선택됨</Badge>}
                  </div>
                  {hasVal(m.job) && <div className="mt-0.5 text-xs text-sub">{m.job}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {hasVal(m.mbti) && <Chip>{m.mbti}</Chip>}
                    {hasVal(m.pain) && <Chip>{m.pain}</Chip>}
                    <Chip muted={!goalSet}>{goalSet ? `목표 ${m.goal}` : "목표 미설정"}</Chip>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted group-hover:text-primary-strong" />
              </Card>
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
  const [settingsSub, setSettingsSub] = useState("me");

  // --- Supabase 연동 상태 ---
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [dbNote, setDbNote] = useState("");
  // 클로징 저장(1·2차) 성공 시 증가 → PtConfirmBanner가 ot_log 재조회(같은 회원 stale 방지).
  // ⚠️ ③에서 클로징 저장 지점(재등록·이탈 UI 등)이 늘면 그 성공 지점에도 onClosingSaved를 물려야 함.
  const [closingVersion, setClosingVersion] = useState(0);
  const [myUid, setMyUid] = useState(null); // 현재 로그인 uid — 내 회원 판별(원장 스코프)
  const { isSolo, isCenter, trainerName } = useAccount(); // solo=admin 숨김. isCenter=확정 center일 때만 admin 노출(fail-closed).
  const [bellOpen, setBellOpen] = useState(false);   // 공지 재열람(벨) 모달
  const [unreadCount, setUnreadCount] = useState(0); // 공지 안읽음 배지 수
  const scheduleRef = useRef(null); // '오늘' 스택 내 스케줄 섹션 — 미처리예약 클릭 시 스크롤 타겟(같은 탭이라 setTab no-op 회귀 방지)

  const loadMembers = async () => {
    if (!supabase) {
      setDbNote("데모 모드 — Supabase 키를 설정하면 실데이터가 연결됩니다.");
      return;
    }
    try {
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
    } catch {
      setDbNote("회원 목록을 불러오지 못했어요 — 잠시 후 새로고침 해주세요.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
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
    try {
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
    } catch {
      setDbNote("PT 등록 확정 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      return false;
    }
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
      <header className="sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            {/* 헤더 락업 — 심볼 + 워드마크 + 로그인한 트레이너.
                회원 드롭다운을 걷어내 자리가 생겼으므로 위계를 바로잡았다.
                이전엔 워드마크 13px < 이름 14px로 위계가 뒤집혀 있었다(브랜드가 더 작음).
                → 워드마크를 h3 스케일(17px)로 올려 브랜드를 앞세우고,
                  이름은 12px muted 보조 라인으로 내린다. 심볼 36px과 두 줄 높이가 맞는다.
                워드마크는 shrink-0(쪼개짐·잘림 금지), 이름만 길면 truncate. */}
            <div className="flex min-w-0 shrink-0 items-center gap-2.5">
              <Image src="/icons/icon-192.png" alt="오직 트레이너" width={36} height={36} priority className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0">
                <Wordmark className="block text-[17px] font-extrabold leading-none tracking-[-0.04em]" />
                <div className="mt-1 max-w-[140px] truncate text-[12px] font-medium leading-none text-muted sm:max-w-none">
                  {trainerName || "트레이너"}
                </div>
              </div>
            </div>

            {/* 회원 드롭다운 제거(2026-07-21) — 현장에서 거의 안 쓴다는 판단.
                회원 선택은 회원 목록 카드 탭이 주 경로이고, '오늘' 할일·이탈위험·내 실적에서도
                해당 회원으로 바로 들어간다(setSelectedId 경로 5곳). 즉 기능 손실이 없다.
                덤으로 폰 헤더가 빡빡해서 워드마크가 겹치던 원인도 사라진다. */}
            <div className="flex min-w-0 items-center gap-2">
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

              {isCenter && (
                <a
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-700 transition hover:border-fuchsia-500/60 active:scale-95"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">관리자</span>
                </a>
              )}
            </div>
          </div>

          {/* 상단 컨텍스트 탭 — 회원 워크플로우(OT amber / PT sky) 서브탭만. 글로벌 4탭은 하단바로 이관.
             워크플로우 탭(group 있는 탭)에 들어갔을 때만 노출. */}
          {TABS.find((t) => t.id === tab)?.group && (
            <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap">
              {TABS
                .filter((t) => (t.ot && view === "ot") || (t.pt && view === "pt"))
                .map((t) => {
                  const on = tab === t.id;
                  const g = GROUP_TAB[t.group];
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${on ? g.active : g.idle}`}
                    >
                      {t.label}
                      {on && <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${g.bar}`} />}
                    </button>
                  );
                })}
            </nav>
          )}

          {/* 설정 서브탭 — OT/PT와 같은 레시피(활성=진한 텍스트+언더바), 브랜드 레드. */}
          {tab === 7 && (
            <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap">
              {SETTINGS_SUBTABS.map((t) => {
                const on = settingsSub === t.id;
                const g = GROUP_TAB.settings;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSettingsSub(t.id)}
                    className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${on ? g.active : g.idle}`}
                  >
                    {t.label}
                    {on && <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${g.bar}`} />}
                  </button>
                );
              })}
            </nav>
          )}
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
        <div key={tab} className="tab-anim">
        {tab === 9 ? (
          <div className="space-y-8">
            {/* 스케줄 보드는 자체 최상단 제목이 없어 Eyebrow로 섹션 헤더를 얹음(TodoTab은 자체 '오늘 할일' 제목 보유). */}
            <div ref={scheduleRef} className="scroll-mt-20">
              <Eyebrow icon={CalendarDays}>오늘 스케줄</Eyebrow>
              <ScheduleBoard members={members} />
            </div>
            <div className="border-t border-line" />
            <ChurnRiskToday members={members} onSelect={(id, toTab) => { setSelectedId(id); setTab(toTab ?? 1); }} />
            <TodoTab
              members={members}
              uid={myUid}
              onSelect={(id, toTab) => { setSelectedId(id); if (toTab === 9) scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); else setTab(toTab ?? 1); }}
            />
          </div>
        ) : tab === 7 ? (
          <div><SettingsView isSolo={isSolo} sub={settingsSub} /></div>
        ) : tab === 8 ? (
          <div><MyStats members={members} isSolo={isSolo} onSelect={(id) => { setSelectedId(id); setTab(0); }} /></div>
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
        {member && tab !== 0 && (
          <div className="mb-3 flex justify-end">
            <button
              onClick={() => setShowEdit(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-sub transition hover:text-primary-strong"
            >
              <Pencil className="h-3.5 w-3.5" /> 정보 수정
            </button>
          </div>
        )}
        {/* viewFor(member)로 뷰 스위치. 'ot'면 아래 6탭 그대로, 그 외는 PT/inactive 뷰. */}
        <MemberViewShell member={member} tab={tab} onGoList={() => setTab(0)} showList={tab === 0} onMemberPatch={onMemberPatch} onMembersChanged={loadMembers}>
          {tab === 0 && (
            <div>
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
            <div><FirstOTTab member={member} /></div>
          )}

          {tab === 2 && (
            <div>
            <SecondOTTab
              member={member}
              onClosingSaved={() => setClosingVersion((v) => v + 1)}
            />
            </div>
          )}
          {tab === 5 && (
            <div>
            <ObservationTab
              member={member}
              onClosingSaved={() => setClosingVersion((v) => v + 1)}
            />
            </div>
          )}
        </MemberViewShell>
          </>
        )}
        </div>
      </main>


      {/* ================= 신규 회원 등록 모달 ================= */}
      {showForm && (
        <MemberForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadMembers();
          }}
        />
      )}
      {showEdit && member && (
        <MemberEditForm
          member={member}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadMembers(); }}
        />
      )}

      <BottomNav tab={tab} onTab={setTab} />
    </div>
  );
}

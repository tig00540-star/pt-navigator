"use client";
/* =========================================================================
   MemberForm — 신규 회원 사전 정보 등록 모달(공유).
   · 트레이너 앱: `assignTrainers` 미제공 → insert에 trainer_id 미포함(DB default = auth.uid()).
   · admin(대표): `assignTrainers` 제공 → '담당 트레이너' 선택 필드 노출 + insert에 trainer_id 세팅
     (user_table + carry 계약 session_log 둘 다 · buildContract는 trainer_id 안 넣으므로 바깥에서 덧씌움).
   ========================================================================= */
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { initialStatus, buildContract } from "@/lib/memberStatus";
import { personName } from "@/lib/format";
import Modal from "@/components/ui/Modal";
import NumberInput from "@/components/ui/NumberInput";
import Button from "@/components/ui/Button";
import HealthConsentBlock, { recordHealthConsent } from "@/components/views/HealthConsentBlock";
import { CONSENT_VERSION } from "@/lib/consent";
import { MEMBER_OPTS } from "@/lib/memberOptions";
import { UserPlus, X, ChevronDown, ChevronRight } from "lucide-react";

// 입력 칸 하나 — opts 있으면 datalist(드롭다운 제안 + 자유 입력=기타). 모듈 레벨(렌더 내 정의 금지 · lint).
function FieldCell({ f, value, onChange }) {
  return (
    <div className={f.k === "name" ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-[12px] font-medium text-muted">
        {f.label}
        {f.k === "name" && <span className="text-primary-strong"> *</span>}
      </label>
      <input
        type={f.type || "text"}
        value={value}
        onChange={onChange}
        placeholder={f.ph}
        list={f.opts ? `ml-${f.k}` : undefined}
        className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
      />
      {f.opts && <datalist id={`ml-${f.k}`}>{f.opts.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  );
}

export default function MemberForm({ onClose, onSaved, assignTrainers }) {
  const [form, setForm] = useState({
    name: "",
    phone_number: "",
    age: "",
    job: "",
    residence: "",
    mbti: "",
    gender: "",
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
  const [assignedTrainerId, setAssignedTrainerId] = useState(""); // admin 배정 모드에서만 사용
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showDetail, setShowDetail] = useState(false); // OT 사전 문진 접기(기본 닫힘 · 입력 부담↓)
  const [healthOk, setHealthOk] = useState(false); // 건강정보 동의 받음(트레이너 확인) — 체크해야 불편 부위 · 부상 이력 칸이 열린다
  const savedIdRef = useRef(null);
  const carryDoneRef = useRef(false); // 이월계약까지 저장됐나(실패 뒤 재시도 때 계약만 다시) // 회원은 저장됐는데 건강정보 단계가 실패한 뒤 다시 누를 때 회원이 두 번 생기지 않게

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      setErr("이름은 필수입니다.");
      return;
    }
    if (assignTrainers && !assignedTrainerId) {
      setErr("담당 트레이너를 선택해 주세요");
      return;
    }
    if (!supabase) {
      setErr("Supabase가 아직 설정되지 않았어요. .env.local의 키를 확인해 주세요.");
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
    let memberId = savedIdRef.current;
    if (!memberId) {
    const { data: u, error } = await supabase
      .from("user_table")
      .insert({
        name: form.name.trim(),
        phone_number: form.phone_number.trim() || null,
        age: form.age ? Number(form.age) : null,
        job: form.job || null,
        residence: form.residence || null,
        mbti: form.mbti || null,
        gender: form.gender || null,
        goal: form.goal || null,
        goal_deadline: form.goal_deadline || null,
        training_pace: form.training_pace || null,
        exercise_level: form.exercise_level || null,
        quit_reason: form.quit_reason || null,
        past_exercise: form.past_exercise || null,
        availability: form.availability || null,
        activity_level: form.activity_level || null,
        member_note: form.member_note || null,
        origin: form.origin,
        status: initialStatus(form.origin), // ot_funnel→ot_active, 그 외→pt_active(PT 직행 §1.5)
        status_changed_at: new Date().toISOString(),
        ...(assignTrainers ? { trainer_id: assignedTrainerId } : {}), // 배정 모드만(미제공 시 default auth.uid())
      })
      .select(); // 새 회원 id를 받아 이월계약에 연결
    if (error || !u || u.length === 0) {
      setSaving(false);
      setErr(error ? "등록하지 못했어요. 다시 시도해 주세요." : "등록하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
      return;
    }
    memberId = u[0].id;
    savedIdRef.current = memberId;
    }
    // 이월계약 INSERT (handover/external만) — 실패하면 저장을 다시 눌러 계약만 다시 시도한다(2026-10-06).
    if (isCarry && !carryDoneRef.current) {
      const payload = {
        ...buildContract({
          userId: memberId,
          origin: form.origin, // handover/external → counts_as_revenue=false(매출 제외)
          sessions_total: Number(form.carrySessions),
          price_per_session: Number(form.carryPrice),
          amount_total: null, // 이월은 매출 아님
          service_sessions: 0,
        }),
        ...(assignTrainers ? { trainer_id: assignedTrainerId } : {}), // buildContract는 trainer_id 미포함 → 배정 시 덧씌움
      };
      const { data: c, error: cErr } = await supabase
        .from("session_log")
        .insert(payload)
        .select();
      if (cErr || !c || c.length === 0) {
        setSaving(false);
        setErr("회원은 등록했지만 이월계약은 저장하지 못했어요. 저장을 다시 눌러 주세요.");
        return;
      }
      carryDoneRef.current = true;
    }
    // 건강정보 — 동의 기록을 먼저 남기고, 남았을 때만 불편 부위 · 부상 이력을 저장한다(2026-10-05).
    const pain = form.pain.trim();
    const injury = form.injury_history.trim();
    if (healthOk && (pain || injury)) {
      const ok = await recordHealthConsent(supabase, memberId, CONSENT_VERSION);
      const { data: hu, error: he } = ok
        ? await supabase.from("user_table").update({ pain: pain || null, injury_history: injury || null }).eq("id", memberId).select("id")
        : { data: null, error: null };
      if (!ok || he || !hu || hu.length === 0) {
        setErr("회원은 등록했어요. 건강정보는 저장하지 못했어요. 저장을 다시 누르거나 정보 수정에서 적어 주세요.");
        return;
      }
    }
      setSaving(false);
    } catch {
      setErr("등록하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    } finally {
      setSaving(false);
    }
    onSaved();
  };

  // 드롭다운 제안(datalist) — 목록에서 고르거나, 없으면 그냥 직접 타이핑(=기타). 자유 입력 유지.
  const OPTS = MEMBER_OPTS;
  // 기본(항상 표시) — 필수·핵심만. 나머지는 아래 '사전 문진' 접기.
  const BASIC = [
    { k: "name", label: "이름", ph: "김철수" },
    { k: "phone_number", label: "휴대폰 번호 (회원 전용 페이지 로그인용)", ph: "010-1234-5678", type: "tel" },
    { k: "age", label: "나이", ph: "34", type: "number" },
    { k: "goal", label: "목적", ph: "바디프로필", opts: OPTS.goal },
  ];
  // 건강정보(민감정보) — 동의 확인 체크 아래에서만 열린다.
  const HEALTH = [
    { k: "pain", label: "불편 부위", ph: "우측 무릎 통증" },
    { k: "injury_history", label: "부상·수술 이력", ph: "없음 / 2년 전 무릎 수술", opts: OPTS.injury_history },
  ];
  // OT 사전 문진(접기 · 전부 선택) — 비워도 되지만 있으면 AI 근거가 좋아짐.
  const DETAIL = [
    { k: "job", label: "직업", ph: "IT 개발자" },
    { k: "residence", label: "거주지", ph: "센터 인근 오피스텔" },
    { k: "mbti", label: "MBTI", ph: "ISTJ" },
    { k: "goal_deadline",  label: "목표 시점·계기",  ph: "예: 8월 결혼 / 없으면 비움" },
    { k: "training_pace",  label: "원하는 페이스",    ph: "제대로", opts: OPTS.training_pace },
    { k: "exercise_level", label: "운동 경험",        ph: "처음", opts: OPTS.exercise_level },
    { k: "quit_reason",    label: "예전 중단 이유",   ph: "혼자 막막", opts: OPTS.quit_reason },
    { k: "past_exercise",  label: "받아본 유료 운동", ph: "없음", opts: OPTS.past_exercise },
    { k: "availability",   label: "가능 빈도·시간대", ph: "주 2회 · 저녁" },
    { k: "activity_level", label: "하루 활동량",      ph: "주로 앉아서", opts: OPTS.activity_level },
    { k: "member_note",    label: "바라는 점",        ph: "회원이 미리 남긴 말" },
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

        {/* 담당 트레이너 — admin 배정 모드만(트레이너 앱은 로그인 트레이너로 자동). */}
        {assignTrainers && (
          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-muted">
              담당 트레이너<span className="text-primary-strong"> *</span>
            </label>
            <select
              value={assignedTrainerId}
              onChange={(e) => setAssignedTrainerId(e.target.value)}
              className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="">선택하세요</option>
              {assignTrainers.map((t) => (
                <option key={t.id} value={t.id}>{personName(t.name)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 기본 정보(항상 표시) — 필수·핵심. sm+에서만 2열(계단 밀림 방지). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BASIC.map((f) => (
            <FieldCell key={f.k} f={f} value={form[f.k]} onChange={set(f.k)} />
          ))}
          {/* 성별 — AI가 동작을 성별에 맞춰 제시하는 재료(선택) */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted">성별 (선택)</label>
            <select
              value={form.gender}
              onChange={set("gender")}
              className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="">선택 안 함</option>
              <option value="female">여성</option>
              <option value="male">남성</option>
            </select>
          </div>
        </div>

        {/* 건강정보 — 동의 받았다고 체크해야 칸이 열린다 */}
        <div className="mt-3">
          <HealthConsentBlock checked={healthOk} onChange={setHealthOk}>
            {HEALTH.map((f) => (
              <FieldCell key={f.k} f={f} value={form[f.k]} onChange={set(f.k)} />
            ))}
          </HealthConsentBlock>
        </div>

        {/* OT 사전 문진 — 접기(기본 닫힘). 비워도 등록되고, 채우면 AI 근거가 좋아짐. */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-left text-[12px] font-semibold text-sub transition-colors hover:text-ink"
          >
            {showDetail ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
            OT 사전 문진 <span className="text-[12px] font-normal text-muted">(선택 · 비워도 됨 · 채우면 AI 근거↑)</span>
          </button>
          {showDetail && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DETAIL.map((f) => (
                <FieldCell key={f.k} f={f} value={form[f.k]} onChange={set(f.k)} />
              ))}
            </div>
          )}
        </div>

        {/* ② 진입 문(origin) — status는 여기서 파생. status 드롭다운은 만들지 않음(§7). */}
        <div className="mt-3">
          <label className="mb-1 block text-[12px] font-medium text-muted">등록 유형</label>
          <select
            value={form.origin}
            onChange={set("origin")}
            className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="ot_funnel">신규 (OT 진행)</option>
            <option value="handover">인계받은 PT</option>
            <option value="external">외부 PT 등록</option>
          </select>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            인계·외부 PT는 OT 없이 바로 PT 뷰로 시작합니다. 상태는 자동 결정.
          </p>
        </div>

        {/* 이월 계약 — handover/external만. ot_funnel은 계약을 ① PT 확정 때 생성. */}
        {form.origin !== "ot_funnel" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">남은 세션수 *</span>
              <NumberInput
                value={form.carrySessions}
                onValueChange={(v) => setForm((f) => ({ ...f, carrySessions: v }))}
                placeholder="20"
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">회당단가(원) *</span>
              <NumberInput
                value={form.carryPrice}
                onValueChange={(v) => setForm((f) => ({ ...f, carryPrice: v }))}
                placeholder="50000"
                className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
              />
            </label>
            <p className="sm:col-span-2 text-[12px] text-muted">
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

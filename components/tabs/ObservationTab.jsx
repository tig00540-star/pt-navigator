"use client";

/* =========================================================================
   TAB 5  —  1차 OT 관찰 기록 (데이터 뼈대, AI 없음)
   트레이너가 회원 관찰 3덩어리(움직임·반응·목적)를 입력 → ot_log 저장/업서트.
   회원당 1차(ot_round=1) 1행 유지. supabase/회원 미설정 시 저장 비활성 + 안내.
   ========================================================================= */

import { useEffect, useState } from "react";
import { FileText, Footprints, Handshake, Plus, Save, Smile, Target, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import ReapproachDateField from "@/components/ui/ReapproachDateField";
import { useToast } from "@/hooks/useToast";
import { inputCls } from "@/components/ui/Field";
import {
  STIMULUS_OPTS,
  ATTITUDE_TAGS,
  GOAL_TYPE_OPTS,
  CLOSING_RESULT_OPTS,
  CLOSING_APPROACH_OPTS,
  CLOSING_REASON_OPTS,
  SALES_INTENSITY_OPTS,
} from "@/lib/labels";

/* 드롭다운 라벨 맵은 lib/labels.js로 공용 추출됨(SecondOTTab과 공유). */

const emptyMovement = () => ({ observation: "", memberAware: false, plan2nd: "" });

function emptyForm() {
  return {
    movements: [emptyMovement()],
    reaction: { stimulus: "normal", attitudeTags: [], memo: "" },
    goal: { identified: false, type: "appearance", detail: "" },
    memberQuote: "", // report.memberQuote (2차 '1차 소환' 비트 재료)
    trainerNote: "", // report.trainer_note (트레이너 종합 소견 — 2차 AI 재료, B2-a)
    salesIntensity: "standard", // report.sales_intensity (트레이너 지시 강도 — B2-a2)
    closingResult: "none", // ㉠ closing_result (top-level 컬럼)
    closingApproach: "other", // ㉠ closing_approach (top-level 컬럼)
    closingReapproachAt: "", // 보류 재접근 예정일 (closing_reapproach_at, date)
    closingReason: "", // 실패/보류 사유 카테고리(closing_reason)
    detailApproach: "", // 3박자 ① 접근(closing_detail.approach)
    detailReaction: "", // 3박자 ② 반응(closing_detail.reaction)
    detailOutcome: "", // 3박자 ③ 결과(closing_detail.outcome)
  };
}

/* ot_log 행 → 폼 상태 (report jsonb 방어적 파싱). */
function rowToForm(row) {
  const r = row?.report || {};
  const movements =
    Array.isArray(r.movements) && r.movements.length
      ? r.movements.map((m) => ({
          observation: m?.observation || "",
          memberAware: !!m?.memberAware,
          plan2nd: m?.plan2nd || "",
        }))
      : [emptyMovement()];
  return {
    movements,
    reaction: {
      stimulus: r.reaction?.stimulus || "normal",
      attitudeTags: Array.isArray(r.reaction?.attitudeTags)
        ? r.reaction.attitudeTags
        : [],
      memo: r.reaction?.memo || "",
    },
    goal: {
      identified: !!r.goal?.identified,
      type: r.goal?.type || "appearance",
      detail: r.goal?.detail || "",
    },
    memberQuote: typeof r.memberQuote === "string" ? r.memberQuote : "",
    trainerNote: typeof r.trainer_note === "string" ? r.trainer_note : "",
    salesIntensity: r.sales_intensity || "standard",
    closingResult: row?.closing_result || "none",
    closingApproach: row?.closing_approach || "other",
    closingReapproachAt: row?.closing_reapproach_at || "",
    closingReason: row?.closing_reason || "",
    detailApproach: row?.closing_detail?.approach || "",
    detailReaction: row?.closing_detail?.reaction || "",
    detailOutcome: row?.closing_detail?.outcome || "",
  };
}

export default function ObservationTab({ member, onClosingSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [existingRowId, setExistingRowId] = useState(null);
  // ① 캐시 공존 — 저장 시 report.first_assist를 안 덮게 보존(각 writer 자기 필드만).
  const [existingFirstAssist, setExistingFirstAssist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const canEdit = Boolean(supabase && member?.id);

  // 회원 선택 시 기존 1차 관찰 프리필 (없으면 빈 폼) — 회원당 1행 유지.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canEdit) {
        if (!cancelled) {
          setForm(emptyForm());
          setExistingRowId(null);
          setExistingFirstAssist(null);
        }
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("ot_log")
          .select("*")
          .eq("user_id", member.id)
          .eq("ot_round", 1)
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (error) {
          setForm(emptyForm());
          setExistingRowId(null);
          showToast("불러오기 실패: " + error.message);
          return;
        }
        const row = data?.[0];
        if (row) {
          setForm(rowToForm(row));
          setExistingRowId(row.id);
          setExistingFirstAssist(row.report?.first_assist ?? null); // ① 캐시 보존용
        } else {
          setForm(emptyForm());
          setExistingRowId(null);
          setExistingFirstAssist(null);
        }
      } catch {
        if (!cancelled) { setForm(emptyForm()); setExistingRowId(null); showToast("불러오기 실패 — 네트워크 확인"); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  // ---- 폼 setter들 ----
  const setMovement = (i, key, val) =>
    setForm((f) => ({
      ...f,
      movements: f.movements.map((m, idx) => (idx === i ? { ...m, [key]: val } : m)),
    }));
  const addMovement = () =>
    setForm((f) =>
      f.movements.length >= 3 ? f : { ...f, movements: [...f.movements, emptyMovement()] }
    );
  const removeMovement = (i) =>
    setForm((f) =>
      f.movements.length <= 1
        ? f
        : { ...f, movements: f.movements.filter((_, idx) => idx !== i) }
    );
  const setReaction = (key, val) =>
    setForm((f) => ({ ...f, reaction: { ...f.reaction, [key]: val } }));
  const toggleTag = (val) =>
    setForm((f) => {
      const has = f.reaction.attitudeTags.includes(val);
      return {
        ...f,
        reaction: {
          ...f.reaction,
          attitudeTags: has
            ? f.reaction.attitudeTags.filter((t) => t !== val)
            : [...f.reaction.attitudeTags, val],
        },
      };
    });
  const setGoal = (key, val) =>
    setForm((f) => ({ ...f, goal: { ...f.goal, [key]: val } }));
  const setTop = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const report = {
        movements: form.movements,
        reaction: form.reaction,
        goal: form.goal,
        memberQuote: form.memberQuote,
        trainer_note: form.trainerNote, // 트레이너 종합 소견(B2-a) — first_assist와 함께 report 공존
        sales_intensity: form.salesIntensity, // 트레이너 지시 강도(B2-a2)
        // ① 캐시 공존 — 기존 first_assist가 있으면 보존(관찰 저장이 캐시를 덮지 않게).
        ...(existingFirstAssist ? { first_assist: existingFirstAssist } : {}),
      };
      // goal_type / goal_identified 는 report.goal 값을 미러링(조회 편의).
      // closing_result / closing_approach 는 top-level 컬럼(㉠ 1차 클로징 결과).
      const isClosed = ["success", "fail", "hold"].includes(form.closingResult);
      const hasDetail = form.detailApproach || form.detailReaction || form.detailOutcome;
      const payload = {
        user_id: member.id,
        ot_round: 1,
        goal_type: form.goal.type,
        goal_identified: form.goal.identified,
        closing_result: form.closingResult,
        closing_approach: form.closingApproach,
        // 보류일 때만 재접근 예정일 top-level 추가(그 외엔 미포함=미변경). report·closing_* 안 덮음.
        ...(form.closingResult === "hold"
          ? { closing_reapproach_at: form.closingReapproachAt || null }
          : {}),
        // 사유(실패/보류) · 3박자(클로징된 경우) — round2와 동일 규칙. 미시도(none)면 3개 다 미포함=미변경.
        ...((form.closingResult === "fail" || form.closingResult === "hold")
          ? { closing_reason: form.closingReason || null }
          : {}),
        ...(isClosed
          ? {
              closing_detail: hasDetail
                ? {
                    approach: form.detailApproach || null,
                    reaction: form.detailReaction || null,
                    outcome: form.detailOutcome || null,
                  }
                : null,
            }
          : {}),
        // D-3 재료 — 클로징 시점 회원 프로파일 스냅샷(클로징된 경우만).
        ...(isClosed
          ? {
              closing_profile: {
                age: member.age ?? null, job: member.job ?? null, residence: member.residence ?? null,
                mbti: member.mbti ?? null, pain: member.pain ?? null, goal: member.goal ?? null,
                goal_type: form.goal.type ?? null,
              },
            }
          : {}),
        report,
      };
      if (existingRowId) {
        // .select()로 갱신된 행을 돌려받는다. error 없이 0행이면 RLS/정책 문제(조용한 실패) → 명시적 안내.
        const { data, error } = await supabase
          .from("ot_log")
          .update(payload)
          .eq("id", existingRowId)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          showToast("저장 안 됨 — 권한/정책을 확인하세요 (0행 갱신)");
          return;
        }
        showToast("관찰 기록이 수정되었습니다");
      } else {
        const { data, error } = await supabase
          .from("ot_log")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) setExistingRowId(data.id);
        showToast("관찰 기록이 저장되었습니다");
      }
      // 여기 도달 = 성공만(update 0행은 위에서 return, 에러는 throw) → 부모가 배너 재조회(1차 즉등록 성공 포함).
      onClosingSaved?.();
    } catch (e) {
      showToast("저장 실패: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const goalIdentifiedValue = form.goal.identified ? "identified" : "unclear";

  return (
    <div className="space-y-6">
      <Eyebrow icon={Footprints}>1차 OT 관찰 기록</Eyebrow>

      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-sub">
          <span className="font-semibold text-ink">{member.name}</span> 회원 · 1차 OT 관찰
        </div>
        {canEdit && (
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              existingRowId
                ? "border-sky-500/40 bg-sky-500/10 text-sky-700"
                : "border-primary/30 bg-primary-soft text-primary-strong"
            }`}
          >
            {existingRowId ? "수정" : "신규"}
          </span>
        )}
      </div>

      {/* 회원/키 미설정 안내 */}
      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          {!supabase
            ? "데모 모드 — Supabase 키가 없어 저장은 비활성화됩니다. 입력은 가능하지만 저장되지 않아요."
            : "회원을 먼저 선택하세요. (회원 탭에서 선택하면 이 회원에 관찰 기록이 저장됩니다.)"}
        </div>
      )}

      {loading && (
        <div className="text-xs text-muted">기존 관찰 기록을 불러오는 중…</div>
      )}

      {/* ① 움직임 관찰 */}
      <section className="rounded-xl border border-line bg-card shadow-sm p-4">
        <div className="mb-3 flex items-center justify-between">
          {/* Eyebrow와 동일 조판을 인라인으로 — 옆에 '추가' 버튼이 붙어야 해서 Eyebrow(mb-4 내장)를 그대로 못 쓴다.
              기존엔 아이콘에 text-primary-strong이 빠져 이 제목만 회색이었다(형제 ②③④는 레드). 함께 교정. */}
          <div className="flex items-center gap-2">
            <Footprints className="h-4 w-4 text-primary-strong" />
            <span className="text-xs font-semibold tracking-label-ko text-sub">① 움직임 관찰</span>
          </div>
          <Button variant="ghost" size="sm" onClick={addMovement} disabled={form.movements.length >= 3}>
            <Plus className="h-3.5 w-3.5" /> 추가
          </Button>
        </div>

        <div className="space-y-3">
          {form.movements.map((m, i) => (
            <div
              key={i}
              /* 카드 안 카드가 되지 않게 elevate 패널로(= globals.css의 '카드 안 눌린 패널' 용도). */
              className="rounded-xl border border-line bg-elevate p-3.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-primary-strong">
                  #{i + 1}
                </span>
                {form.movements.length > 1 && (
                  <button
                    onClick={() => removeMovement(i)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-elevate hover:text-ink"
                    aria-label="삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <label className="mb-1 block text-[11px] font-medium text-muted">
                관찰 내용
              </label>
              <textarea
                value={m.observation}
                onChange={(e) => setMovement(i, "observation", e.target.value)}
                rows={2}
                placeholder="예) 오버헤드 프레스 시 견갑 상방회전 제한 / 승모근 긴장 높음"
                className={inputCls}
              />

              <label className="mt-2 flex items-center gap-2 text-xs text-sub">
                <input
                  type="checkbox"
                  checked={m.memberAware}
                  onChange={(e) => setMovement(i, "memberAware", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                회원이 수업 중 스스로 인식함
              </label>

              <label className="mt-2 mb-1 block text-[11px] font-medium text-muted">
                2차에 풀 것
              </label>
              <textarea
                value={m.plan2nd}
                onChange={(e) => setMovement(i, "plan2nd", e.target.value)}
                rows={2}
                placeholder="예) 견갑 가동성 먼저, 그 후 프레스 재시도"
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ② 회원 반응·성향 */}
      <section className="rounded-xl border border-line bg-card shadow-sm p-4">
        <Eyebrow icon={Smile}>② 회원 반응·성향</Eyebrow>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">
              자극 인지도
            </label>
            <select
              value={form.reaction.stimulus}
              onChange={(e) => setReaction("stimulus", e.target.value)}
              className={inputCls}
            >
              {STIMULUS_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-muted">
              태도 태그 (다중선택)
            </label>
            <div className="flex flex-wrap gap-2">
              {ATTITUDE_TAGS.map((t) => {
                const on = form.reaction.attitudeTags.includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleTag(t.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "border-primary/30 bg-primary-soft text-primary-strong"
                        : "border-line bg-card text-muted hover:border-primary"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ② '자유 메모' 입력칸은 제거했다 — ④ 트레이너 종합 소견과 쓰임이 겹쳐,
              트레이너가 같은 말을 어디에 적어야 하는지 매번 고민하게 만들었다.
              자유 서술은 ④ 한 곳으로 모은다(2차 AI도 trainer_note를 주 재료로 읽는다).

              ⚠️ 상태(form.reaction.memo)는 일부러 남겼다 — 입력칸만 없앤 통과 경로다.
              지우면 기존 행을 열어 저장할 때 예전에 적어둔 메모가 ""로 덮여 조용히 사라진다.
              지금은 로드된 값이 그대로 실려 나가 보존되고, AI 재료로도 계속 쓰인다.
              otHash도 건드리지 않는다 — 해시 입력이 바뀌면 이미 캐시된 2차 브리핑이
              전부 '오래됨'으로 뜬다(실제로는 아무것도 안 변했는데). */}

          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">
              회원 한마디 <span className="text-muted">(2차 OT 때 다시 꺼내 쓸 회원의 말)</span>
            </label>
            <input
              type="text"
              value={form.memberQuote}
              onChange={(e) => setTop("memberQuote", e.target.value)}
              placeholder='예) "왜 아픈지 처음 알았어요"'
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* ③ 진짜 목적 */}
      <section className="rounded-xl border border-line bg-card shadow-sm p-4">
        <Eyebrow icon={Target}>③ 진짜 목적</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">
              파악 여부
            </label>
            <select
              value={goalIdentifiedValue}
              onChange={(e) => setGoal("identified", e.target.value === "identified")}
              className={inputCls}
            >
              <option value="identified">파악됨</option>
              <option value="unclear">불명확</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">
              목적 유형
            </label>
            <select
              value={form.goal.type}
              onChange={(e) => setGoal("type", e.target.value)}
              className={inputCls}
            >
              {GOAL_TYPE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-medium text-muted">
              상세
            </label>
            <input
              type="text"
              value={form.goal.detail}
              onChange={(e) => setGoal("detail", e.target.value)}
              placeholder='예) "가을 결혼식", "무릎 재활 후 복귀"'
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* ④ 트레이너 종합 소견 (report.trainer_note — 2차 AI 재료. B2-b에서 프롬프트 연동) */}
      <section className="rounded-xl border border-line bg-card shadow-sm p-4">
        <Eyebrow icon={FileText}>④ 트레이너 종합 소견</Eyebrow>
        <div>
          <textarea
            value={form.trainerNote}
            onChange={(e) => setTop("trainerNote", e.target.value)}
            rows={4}
            placeholder="이 회원 전체에 대한 종합 소견·가설·2차에서 파고들 방향"
            className={inputCls}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            2차 OT 준비 시 재료가 됩니다. 정형 항목에 안 담기는 종합 판단을 자유롭게.
          </p>

          <div className="mt-4">
            <label className="mb-1 block text-[11px] font-medium text-muted">세일즈 강도</label>
            <select
              value={form.salesIntensity}
              onChange={(e) => setTop("salesIntensity", e.target.value)}
              className={inputCls}
            >
              {SALES_INTENSITY_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* 설명은 트레이너 말로 — 원래는 "근거를 얼마나 또렷이 짚을지(압박 세기 아님)",
                "사실 기반 필요성", "라포 위주"처럼 스펙 문서 어휘였다. 이 값이 실제로 바꾸는 건
                2차 브리핑의 말투 하나뿐이니 그것만 말한다. 마지막 문장은 남겼다 —
                '강하게'를 고를 때 없는 문제를 지어내는 건 아닌지가 트레이너의 실제 걱정이다. */}
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              2차 브리핑의 말투를 정해요. &lsquo;강하게&rsquo;는 등록이 왜 필요한지 분명히 짚고, &lsquo;부드럽게&rsquo;는 오늘은 친해지는 데 집중해요. 어느 쪽이든 없는 문제를 지어내지는 않아요.
            </p>
          </div>
        </div>
      </section>

      {/* ㉠ 1차 클로징 결과 */}
      <section className="rounded-xl border border-line bg-card shadow-sm p-4">
        <Eyebrow icon={Handshake}>㉠ 1차 클로징 결과</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">
              클로징 결과
            </label>
            <select
              value={form.closingResult}
              onChange={(e) => setTop("closingResult", e.target.value)}
              className={inputCls}
            >
              {CLOSING_RESULT_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">
              클로징 방향
            </label>
            <select
              value={form.closingApproach}
              onChange={(e) => setTop("closingApproach", e.target.value)}
              className={inputCls}
            >
              {CLOSING_APPROACH_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 실패/보류일 때만 사유 카테고리 (약점 진단 · 집계) — round2 미러 */}
          {(form.closingResult === "fail" || form.closingResult === "hold") && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-muted">사유 <span className="text-muted">(약점 진단 · 집계)</span></label>
              <select value={form.closingReason} onChange={(e) => setTop("closingReason", e.target.value)} className={inputCls}>
                <option value="">선택 안 함</option>
                {CLOSING_REASON_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* 성공/실패/보류일 때 클로징 케이스 3박자 (선택 · AI 리딩 재료) — round2 미러 */}
          {["success", "fail", "hold"].includes(form.closingResult) && (
            <div className="sm:col-span-2 space-y-2">
              <p className="text-[11px] text-muted">클로징 케이스 (선택 · 나중 AI 리딩 재료)</p>
              {[
                { key: "detailApproach", label: "① 어떻게 접근했나", ph: "어떤 방향·멘트로 제안했나" },
                { key: "detailReaction", label: "② 회원 반응·멘트", ph: "회원이 뭐라 했나(가능하면 그대로) — 마음 연/거절한 말" },
                { key: "detailOutcome", label: "③ 그래서 어떻게 됐나", ph: "결과·내 대응 — 예: 등록(12주) / 물러섬·재접근일 안 잡음" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-[11px] font-medium text-muted">{f.label}</label>
                  <textarea value={form[f.key]} onChange={(e) => setTop(f.key, e.target.value)} rows={2} placeholder={f.ph} className={inputCls + " resize-none"} />
                </div>
              ))}
            </div>
          )}

          {/* 보류('hold')일 때만 재접근 예정일 (B안: 프리셋 + 수동) */}
          {form.closingResult === "hold" && (
            <div className="sm:col-span-2">
              <ReapproachDateField
                value={form.closingReapproachAt}
                onChange={(v) => setTop("closingReapproachAt", v)}
              />
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          1차에서 클로징을 시도했다면 결과·방향을 기록하세요. &lsquo;성공&rsquo;이면 2차 OT 탭이 등록 완료로 표시되어 AI 브리핑을 건너뜁니다.
        </p>
      </section>

      {/* 저장 */}
      <Button variant="primary" size="md" fullWidth onClick={save} disabled={!canEdit || saving || loading} className="gap-2">
        <Save className="h-5 w-5" strokeWidth={2.5} />
        {saving ? "저장 중…" : existingRowId ? "관찰 기록 수정" : "관찰 기록 저장"}
      </Button>

      <Toast message={toast} />
    </div>
  );
}

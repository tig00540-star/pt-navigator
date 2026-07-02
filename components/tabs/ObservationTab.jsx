"use client";

/* =========================================================================
   TAB 5  —  1차 OT 관찰 기록 (데이터 뼈대, AI 없음)
   트레이너가 회원 관찰 3덩어리(움직임·반응·목적)를 입력 → ot_log 저장/업서트.
   회원당 1차(ot_round=1) 1행 유지. supabase/회원 미설정 시 저장 비활성 + 안내.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Footprints, Plus, Save, Smile, Target, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

/* 라벨(한글) ↔ 저장값(영문 키) 분리 — 통계·AI가 값으로 다루기 쉽게. */
const STIMULUS_OPTS = [
  { value: "well", label: "잘 느낌" },
  { value: "normal", label: "보통" },
  { value: "poor", label: "잘 못 느낌" },
];
const ATTITUDE_TAGS = [
  { value: "timid", label: "겁많음" },
  { value: "active", label: "적극적" },
  { value: "passive", label: "시키는것만" },
  { value: "enjoys", label: "재미있어함" },
];
const GOAL_TYPE_OPTS = [
  { value: "appearance", label: "외형변화" },
  { value: "pain", label: "통증개선" },
  { value: "health", label: "건강·체력" },
  { value: "machine_only", label: "기구사용법만" },
  { value: "other", label: "기타" },
];

const emptyMovement = () => ({ observation: "", memberAware: false, plan2nd: "" });

function emptyForm() {
  return {
    movements: [emptyMovement()],
    reaction: { stimulus: "normal", attitudeTags: [], memo: "" },
    goal: { identified: false, type: "appearance", detail: "" },
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
  };
}

const inputCls =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50";

export default function ObservationTab({ member }) {
  const [form, setForm] = useState(emptyForm);
  const [existingRowId, setExistingRowId] = useState(null);
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
        }
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("ot_log")
        .select("*")
        .eq("user_id", member.id)
        .eq("ot_round", 1)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setLoading(false);
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
      } else {
        setForm(emptyForm());
        setExistingRowId(null);
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

  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const report = {
        movements: form.movements,
        reaction: form.reaction,
        goal: form.goal,
      };
      // goal_type / goal_identified 는 report.goal 값을 미러링(조회 편의).
      const payload = {
        user_id: member.id,
        ot_round: 1,
        goal_type: form.goal.type,
        goal_identified: form.goal.identified,
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
        <div className="text-sm text-zinc-300">
          <span className="font-semibold text-zinc-100">{member.name}</span> 회원 · 1차 OT 관찰
        </div>
        {canEdit && (
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              existingRowId
                ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                : "border-lime-500/40 bg-lime-500/10 text-lime-400"
            }`}
          >
            {existingRowId ? "수정" : "신규"}
          </span>
        )}
      </div>

      {/* 회원/키 미설정 안내 */}
      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
          {!supabase
            ? "데모 모드 — Supabase 키가 없어 저장은 비활성화됩니다. 입력은 가능하지만 저장되지 않아요."
            : "회원을 먼저 선택하세요. (회원 탭에서 선택하면 이 회원에 관찰 기록이 저장됩니다.)"}
        </div>
      )}

      {loading && (
        <div className="text-xs text-zinc-500">기존 관찰 기록을 불러오는 중…</div>
      )}

      {/* ① 움직임 관찰 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Footprints className="h-3.5 w-3.5" /> ① 움직임 관찰
          </div>
          <button
            onClick={addMovement}
            disabled={form.movements.length >= 3}
            className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-lime-500/50 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> 추가
          </button>
        </div>

        <div className="space-y-3">
          {form.movements.map((m, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-lime-400">
                  #{i + 1}
                </span>
                {form.movements.length > 1 && (
                  <button
                    onClick={() => removeMovement(i)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                    aria-label="삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                관찰 내용
              </label>
              <textarea
                value={m.observation}
                onChange={(e) => setMovement(i, "observation", e.target.value)}
                rows={2}
                placeholder="예) 오버헤드 프레스 시 견갑 상방회전 제한 / 승모근 긴장 높음"
                className={inputCls}
              />

              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={m.memberAware}
                  onChange={(e) => setMovement(i, "memberAware", e.target.checked)}
                  className="h-4 w-4 accent-lime-400"
                />
                회원이 수업 중 스스로 인식함
              </label>

              <label className="mt-2 mb-1 block text-[11px] font-medium text-zinc-500">
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
      <section>
        <Eyebrow icon={Smile}>② 회원 반응·성향</Eyebrow>
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">
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
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-500">
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
                        ? "border-lime-500/40 bg-lime-500/10 text-lime-400"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">
              메모
            </label>
            <textarea
              value={form.reaction.memo}
              onChange={(e) => setReaction("memo", e.target.value)}
              rows={2}
              placeholder="자유 메모"
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* ③ 진짜 목적 */}
      <section>
        <Eyebrow icon={Target}>③ 진짜 목적</Eyebrow>
        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">
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
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">
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
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">
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

      {/* 저장 */}
      <button
        onClick={save}
        disabled={!canEdit || saving || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-lime-500/30 transition active:scale-95 disabled:opacity-50"
      >
        <Save className="h-5 w-5" strokeWidth={2.5} />
        {saving ? "저장 중…" : existingRowId ? "관찰 기록 수정" : "관찰 기록 저장"}
      </button>

      <Toast message={toast} />
    </div>
  );
}

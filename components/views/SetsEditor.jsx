"use client";
/* 세트 그리드(제어 컴포넌트) — 저장 전 보정·손입력 공용. value/onChange만, 순수 UI(데모·키 무관).
   입력은 문자열 그대로 보관(빈칸 허용) — 숫자화·정리는 저장 시 부모가 cleanStructured로.
   음성은 부모가 자동채움, 손입력은 빈 상태로 시작. 편집은 불변 업데이트로 onChange(next). */
import { Dumbbell, Plus, Trash2, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

export default function SetsEditor({ value, onChange, disabled, machineOptions = [] }) {
  const list = Array.isArray(value) ? value : [];

  const patch = (exIdx, updater) =>
    onChange(list.map((ex, i) => (i === exIdx ? updater(ex) : ex)));

  const setExName = (exIdx, name) => patch(exIdx, (ex) => ({ ...ex, exercise: name }));

  const setCell = (exIdx, setIdx, field, val) =>
    patch(exIdx, (ex) => ({
      ...ex,
      sets: (ex.sets || []).map((s, j) => (j === setIdx ? { ...s, [field]: val } : s)),
    }));

  const addSet = (exIdx) =>
    patch(exIdx, (ex) => ({ ...ex, sets: [...(ex.sets || []), { weight: "", reps: "" }] }));

  const removeSet = (exIdx, setIdx) =>
    patch(exIdx, (ex) => ({ ...ex, sets: (ex.sets || []).filter((_, j) => j !== setIdx) }));

  const removeExercise = (exIdx) => onChange(list.filter((_, i) => i !== exIdx));

  const addExercise = () =>
    onChange([...list, { exercise: "", sets: [{ weight: "", reps: "" }] }]);

  return (
    <div className="space-y-3">
      {machineOptions.length > 0 && (
        <datalist id="sets-machine-options">
          {machineOptions.map((name) => <option key={name} value={name} />)}
        </datalist>
      )}
      {list.length === 0 && (
        <p className="text-[11px] leading-relaxed text-muted">
          종목·세트를 입력하면 종목별 무게 그래프에 반영됩니다.
        </p>
      )}

      {list.map((ex, exIdx) => (
        <div key={exIdx} className="rounded-xl border border-line bg-elevate p-3">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
            <input
              type="text"
              list="sets-machine-options"
              value={ex.exercise ?? ""}
              onChange={(e) => setExName(exIdx, e.target.value)}
              disabled={disabled}
              placeholder="종목명 (예: 벤치프레스)"
              className="flex-1 rounded-lg border border-line bg-card px-2 py-1.5 text-sm font-semibold text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              onClick={() => removeExercise(exIdx)}
              disabled={disabled}
              className="shrink-0 rounded p-1 text-muted transition hover:text-rose-600 disabled:opacity-50"
              aria-label="종목 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 space-y-1.5">
            {(ex.sets || []).map((s, setIdx) => (
              <div key={setIdx} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center font-mono text-[10px] font-bold text-muted">{setIdx + 1}</span>
                <label className="flex flex-1 items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={s.weight ?? ""}
                    onChange={(e) => setCell(exIdx, setIdx, "weight", e.target.value)}
                    disabled={disabled}
                    placeholder="무게"
                    className={inputCls}
                  />
                  <span className="text-[11px] text-muted">kg</span>
                </label>
                <span className="text-muted">×</span>
                <label className="flex flex-1 items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={s.reps ?? ""}
                    onChange={(e) => setCell(exIdx, setIdx, "reps", e.target.value)}
                    disabled={disabled}
                    placeholder="횟수"
                    className={inputCls}
                  />
                  <span className="text-[11px] text-muted">회</span>
                </label>
                <button
                  onClick={() => removeSet(exIdx, setIdx)}
                  disabled={disabled}
                  className="shrink-0 rounded p-1 text-muted transition hover:text-rose-600 disabled:opacity-50"
                  aria-label="세트 삭제"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => addSet(exIdx)}
            disabled={disabled}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-sub transition hover:border-primary hover:text-primary-strong disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> 세트
          </button>
        </div>
      ))}

      <button
        onClick={addExercise}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-3 py-2 text-xs font-semibold text-sub transition hover:border-primary hover:text-primary-strong disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> 종목 추가
      </button>
    </div>
  );
}

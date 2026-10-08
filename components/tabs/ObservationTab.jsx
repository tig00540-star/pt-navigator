"use client";

/* =========================================================================
   OT 피드백 — n차 OT가 끝나고 1~2분, 대부분 탭으로(2026-10-02 개편 · 대표 요청).

   왜 바꿨나: 옛 양식은 칸 ~20개(글 9칸)에 같은 내용(회원 반응·목표·다음 계획)을 여러 번 적고,
   '미시도/보류/실패', '클로징 방향', '세일즈 강도', '진짜 목적'의 뜻이 헷갈렸다.
   원칙: 질문 순서 = 다음 OT 준비 순서. 모든 질문은 '다음 OT'를 향한다(칸마다 어디 쓰이는지 한 줄).
     1) 오늘 어떻게 끝났나(결과·제안 여부·망설인 이유·회원이 한 말·다음 OT 날짜)
     2) 오늘 수업에서 본 것(준비 리포트 운동이 미리 채워짐 → 반응 칩 · ★다음에 다시 보여주기 · 회원 성향)
     3) 다음 OT 방향(회원이 진짜 원하는 것·이유 / 다음 OT 등록 제안 수위 / AI에게 한마디)
   ★1차 OT도 목표는 PT 등록이다(대표 못박음) — 제안 여부를 반드시 묻는다.

   저장 형식은 옛 키 그대로(호환) — AI(ot-brief second·salesbook)·통계·케이스 거울이 그대로 읽는다:
     closing_result: 등록=success · 이어감+제안함=hold · 이어감+제안 못함=none(+report.next) · 그만=fail
     report.movements[]: {name, tags, star, observation(요약 문장), memberAware, plan2nd}
     report.reaction.{stimulus(운동 반응에서 도출), attitudeTags} · report.goal · memberQuote · trainer_note
     sales_intensity(=다음 OT 제안 수위) · closing_approach(=원하는 것에서 도출) · closing_detail(자동 요약)
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Plus, Star, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { inputCls } from "@/components/ui/Field";
import { otStepPath } from "@/lib/otRounds";
import { ATTITUDE_TAGS, MOVE_TAGS, WANT_OPTS, NEXT_PUSH_OPTS, CLOSING_REASON_OPTS } from "@/lib/labels";

const RESULTS = [
  { value: "success", label: "등록했어요", hint: "오늘 PT 등록 완료 → PT 회원 전환 안내가 떠요" },
  { value: "continue", label: "다음 OT 이어가요", hint: "아직 등록 전 → 다음 차수 OT가 바로 열려요" },
  { value: "stop", label: "그만하기로 했어요", hint: "더 진행 안 함 → OT를 마무리해요" },
];

// 준비 리포트의 운동 이름 → 칩 이름(설명 꼬리 떼기: "숄더프레스 머신 — 벽 슬라이드 직후…" → "숄더프레스 머신").
const shortName = (s) => String(s || "").split(/\s[—–-]\s|\(|·/)[0].trim().slice(0, 30);

function prepExercises(report, round) {
  const r = report || {};
  const names = round === 1
    ? (r.first_assist?.data?.exercises || []).map((e) => e?.name)
    : [...(r.brief?.session_plan || []).map((p) => p?.exercise), ...(r.brief?.proof?.moves || []).map((m) => m?.exercise)];
  return [...new Set(names.map(shortName).filter(Boolean))].slice(0, 6);
}

/* ot_log 행 → 폼. 새 양식 행(name/tags)과 옛 양식 행(observation 글)을 모두 읽는다. */
function rowToForm(row, round) {
  const r = row?.report || {};
  const res = row?.closing_result || "none";
  const result = res === "success" ? "success" : res === "hold" ? "continue" : res === "fail" ? "stop"
    : r.next === "continue" ? "continue" : "";
  const proposed = res === "hold" ? true : res === "fail" ? (r.proposed ?? true) : res === "success" ? true
    : r.next === "continue" ? false : null;
  const saved = (Array.isArray(r.movements) ? r.movements : []).filter((m) => m && (m.name || (m.observation || "").trim()))
    .map((m) => m.name
      ? { name: m.name, tags: Array.isArray(m.tags) ? m.tags : [], star: !!m.star }
      : { name: shortName(m.observation) || m.observation.slice(0, 30), tags: m.memberAware ? ["aware"] : [], star: !!(m.plan2nd || "").trim(), legacy: m.observation });
  const have = new Set(saved.map((m) => m.name));
  const fromPrep = prepExercises(r, round).filter((n) => !have.has(n)).map((name) => ({ name, tags: [], star: false }));
  return {
    result, proposed,
    reason: row?.closing_reason || "",
    memberQuote: typeof r.memberQuote === "string" ? r.memberQuote : "",
    nextDate: row?.closing_reapproach_at || "",
    moves: [...saved, ...fromPrep],
    traits: Array.isArray(r.reaction?.attitudeTags) ? r.reaction.attitudeTags : [],
    want: r.goal?.type && r.goal.type !== "other" ? r.goal.type : "",
    wantWhy: r.goal?.detail || "",
    // 새 양식에서 고른 값만 '고른 값'으로 본다(옛 양식 기본값 standard는 추천값에 맡김).
    push: r.feedback_v === 2 ? (r.sales_intensity || "") : "",
    note: typeof r.trainer_note === "string" ? r.trainer_note : "",
  };
}

const emptyForm = () => ({ result: "", proposed: null, reason: "", memberQuote: "", nextDate: "", moves: [], traits: [], want: "", wantWhy: "", push: "", note: "" });

// 날짜 빠른 선택(로컬 달력일).
const isoAfter = (days) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// 넓은 화면(@container = 회원 칸 폭): 768px~ ①② 나란히 + ③ 아래 넓게 · 1152px~ 세 블록 나란히.
function Block({ n, title, uses, children, className = "", bodyClassName = "mt-4 space-y-4" }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
          {uses && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{uses}</p>}
        </div>
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function Q({ label, hint, children, className = "" }) {
  return (
    <div className={className}>
      <p className="mb-2 text-[13px] font-semibold text-sub">{label}{hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}</p>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children, tone = "ink" }) {
  const onCls = tone === "primary" ? "border-primary bg-primary-soft text-primary-strong" : "border-ink bg-ink text-white";
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[36px] rounded-full border px-3 text-[13px] transition ${on ? `${onCls} font-semibold` : "border-line bg-card font-normal text-sub hover:border-line-strong hover:text-ink"}`}>
      {children}
    </button>
  );
}

export default function ObservationTab({ member, round = 1, onClosingSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [rowId, setRowId] = useState(null);
  // 기존 report 전체 보존(first_assist·brief·salesbook·inbody_analysis…) — 피드백 키만 덮는다.
  const [existingReport, setExistingReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [adding, setAdding] = useState("");
  const { toast, showToast } = useToast();
  const canEdit = Boolean(supabase && member?.id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canEdit) return;
      setLoading(true);
      try {
        const { data, error } = await supabase.from("ot_log").select("*")
          .eq("user_id", member.id).eq("ot_round", round)
          .order("created_at", { ascending: false }).limit(1);
        if (cancelled) return;
        if (error) { console.error("ot_log 불러오기 실패", error); showToast("불러오지 못했어요. 다시 시도해 주세요."); return; }
        const row = data?.[0] || null;
        setRowId(row?.id ?? null);
        setExistingReport(row?.report || null);
        setForm(row ? rowToForm(row, round) : emptyForm());
      } catch {
        if (!cancelled) showToast("불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, round]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleIn = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const setMove = (i, patch) => setForm((f) => ({ ...f, moves: f.moves.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const toggleMoveTag = (i, t) => setForm((f) => ({
    ...f, moves: f.moves.map((m, j) => (j === i ? { ...m, tags: m.tags.includes(t) ? m.tags.filter((x) => x !== t) : [...m.tags, t] } : m)),
  }));
  const addMove = () => {
    const name = adding.trim();
    if (!name) return;
    setForm((f) => (f.moves.some((m) => m.name === name) ? f : { ...f, moves: [...f.moves, { name, tags: [], star: false }] }));
    setAdding("");
  };
  const removeMove = (i) => setForm((f) => ({ ...f, moves: f.moves.filter((_, j) => j !== i) }));

  // 다음 OT 제안 수위 추천 — 제안했는데 이어가면 '오늘 꼭 마무리'(클로징 우선), 제안 못 했으면 '분명하게'.
  const suggestedPush = form.result === "continue" && form.proposed ? "strong" : "standard";
  const push = form.push || suggestedPush;
  const askReason = (form.result === "continue" && form.proposed) || form.result === "stop";

  const missing = useMemo(() => {
    if (!form.result) return "오늘 어떻게 끝났는지 골라 주세요.";
    if (form.result !== "success" && form.proposed == null) return "등록 제안을 했는지 골라 주세요.";
    return "";
  }, [form.result, form.proposed]);

  const save = async () => {
    if (!canEdit || saving || loading) return; // 기존 행을 다 읽기 전엔 저장하지 않는다(같은 차수 행이 두 개 생기던 문제)
    if (missing) { showToast(missing); return; }
    setSaving(true);
    try {
      // 저장 직전 다시 읽기(2026-10-06) — 서버가 그사이 붙인 세일즈북 · 다른 기기에서 고친 덱을 덮지 않게.
      //   행이 아직 없다고 알고 있어도 한 번 더 찾는다(리포트 생성이 막 행을 만들었을 수 있음).
      let targetId = rowId;
      let base = existingReport || {};
      let prevResult;
      if (supabase) {
        const q = targetId
          ? supabase.from("ot_log").select("id, report, closing_result").eq("id", targetId).maybeSingle()
          : supabase.from("ot_log").select("id, report, closing_result").eq("user_id", member.id).eq("ot_round", round).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const { data: fresh, error: fe } = await q;
        if (fe) throw fe;
        if (fresh) { targetId = fresh.id; base = fresh.report || {}; prevResult = fresh.closing_result; }
      }
      const proposed = form.result === "success" ? true : !!form.proposed;
      const closing_result = form.result === "success" ? "success" : form.result === "stop" ? "fail" : proposed ? "hold" : "none";
      const tagLabel = (t) => MOVE_TAGS.find((x) => x.value === t)?.label || t;
      const moves = form.moves.filter((m) => m.tags.length || m.star).map((m) => ({
        name: m.name, tags: m.tags, star: m.star,
        // AI·옛 화면이 읽는 문장형 요약(값만 · 키 영어 노출 없음)
        observation: `${m.name}: ${m.tags.map(tagLabel).join(", ") || "반응 기록 없음"}`,
        memberAware: m.tags.includes("aware"),
        plan2nd: m.star ? "다음 OT에서 다시 보여주기(증명 재연)" : "",
      }));
      const tags = form.moves.flatMap((m) => m.tags);
      const stimulus = tags.includes("felt") || tags.includes("aware") ? "well" : tags.includes("weak") ? "poor" : "normal";
      const goalType = form.want || "other";
      const approach = ["appearance", "pain", "health"].includes(goalType) ? goalType : "other";
      const isClosed = closing_result !== "none";
      const resultLabel = RESULTS.find((r) => r.value === form.result)?.label || "";
      const report = {
        ...base,
        movements: moves,
        reaction: { stimulus, attitudeTags: form.traits, memo: "" },
        goal: { identified: Boolean(form.wantWhy.trim()), type: goalType, detail: form.wantWhy.trim() },
        memberQuote: form.memberQuote.trim(),
        trainer_note: form.note.trim(),
        sales_intensity: push,
        proposed,
        next: form.result === "continue" ? "continue" : null,
        feedback_v: 2,
        // 저장 시각 — DB 트리거가 ot_log.closing_recorded_at(서버 시각)을 채우는 신호 · 대표 아침 보고서 어제 결과.
        //   결과가 그대로인 고쳐 쓰기(오타 수정 등)는 옛 시각을 유지 → 2주 전 OT가 '어제 결과'로 다시 올라오지 않게(2026-10-06).
        feedbackAt: prevResult === closing_result && base.feedbackAt ? base.feedbackAt : new Date().toISOString(),
      };
      const payload = {
        user_id: member.id,
        ot_round: round,
        goal_type: goalType,
        goal_identified: report.goal.identified,
        closing_result,
        closing_approach: approach,
        closing_reason: askReason ? form.reason || null : null,
        // 결과를 바꾸면 옛 값이 남지 않게(다음 OT 날짜는 '이어가요'일 때만 · 결과 요약은 결과가 있을 때만)
        closing_reapproach_at: form.result === "continue" ? form.nextDate || null : null,
        ...(isClosed ? {
          closing_detail: {
            approach: proposed ? "등록 제안함" : "등록 제안 못 함",
            reaction: report.memberQuote || null,
            outcome: `${resultLabel}${form.result === "continue" && form.nextDate ? ` · 다음 OT ${form.nextDate}` : ""}`,
          },
          closing_profile: {
            age: member.age ?? null, job: member.job ?? null, residence: member.residence ?? null,
            mbti: member.mbti ?? null, pain: member.pain ?? null, goal: member.goal ?? null, goal_type: goalType,
          },
        } : { closing_detail: null, closing_profile: null }),
        report,
      };
      if (targetId) {
        const { data, error } = await supabase.from("ot_log").update(payload).eq("id", targetId).select("id");
        if (error) throw error;
        if (!data || data.length === 0) { showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
        if (targetId !== rowId) setRowId(targetId);
      } else {
        const { data, error } = await supabase.from("ot_log").insert(payload).select("id").single();
        if (error) throw error;
        if (data?.id) setRowId(data.id);
      }
      setExistingReport(report);
      setSavedOnce(true);
      showToast("피드백을 저장했어요");
      onClosingSaved?.();
    } catch (e) {
      console.error("ot_log 저장 실패", e);
      showToast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
    {/* @container는 fixed 자식(Toast)의 기준이 되므로 Toast는 바깥에 둔다. */}
    <div className="@container space-y-4">
      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-700">
          {!supabase ? "데모 모드라 저장은 안 돼요(입력만 가능)." : "회원을 먼저 선택해 주세요."}
        </div>
      )}
      {loading && <p className="text-[12px] text-muted">지난 피드백을 불러오는 중…</p>}

      <div className="grid gap-4 @3xl:grid-cols-2 @3xl:items-start @6xl:grid-cols-3">
      {/* 1. 결과 */}
      <Block n={1} title="오늘 어떻게 끝났나요?" uses="다음 차수 열기 · 클로징률 · 다음 OT 대본의 클로징 방향에 쓰여요">
        <div className="grid gap-2">
          {RESULTS.map((r) => {
            const on = form.result === r.value;
            return (
              <button key={r.value} type="button" onClick={() => set("result", r.value)} aria-pressed={on}
                className={`flex min-h-[56px] items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition ${
                  on ? "border-primary bg-primary-soft" : "border-line bg-card hover:border-line-strong"}`}>
                <span>
                  <span className={`block text-[15px] ${on ? "font-bold text-primary-strong" : "font-semibold text-ink"}`}>{r.label}</span>
                  <span className="block text-[12px] text-muted">{r.hint}</span>
                </span>
                {on && <Check className="h-5 w-5 shrink-0 text-primary-strong" strokeWidth={3} aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {form.result && form.result !== "success" && (
          <Q label="오늘 등록 제안을 했나요?" hint={round === 1 ? "1차 OT도 목표는 PT 등록이에요" : undefined}>
            <div className="flex gap-2">
              <Chip on={form.proposed === true} onClick={() => set("proposed", true)}>했어요</Chip>
              <Chip on={form.proposed === false} onClick={() => set("proposed", false)}>아직 못 했어요</Chip>
            </div>
            {form.result === "continue" && form.proposed === false && (
              <p className="mt-2 text-[12px] leading-relaxed text-ot-text">다음 OT 대본이 &lsquo;이번엔 꼭 제안까지&rsquo;로 맞춰져요.</p>
            )}
            {form.result === "continue" && form.proposed === true && (
              <p className="mt-2 text-[12px] leading-relaxed text-ot-text">다음 OT는 &lsquo;클로징 우선&rsquo;으로 준비돼요. 망설인 이유부터 풀고 등록을 마무리해요.</p>
            )}
          </Q>
        )}

        {askReason && (
          <Q label="왜 망설였나요?" hint="다음 OT 거절 대응을 이 이유 중심으로 준비해요">
            <div className="flex flex-wrap gap-1.5">
              {CLOSING_REASON_OPTS.map((o) => (
                <Chip key={o.value} on={form.reason === o.value} onClick={() => set("reason", form.reason === o.value ? "" : o.value)}>{o.label}</Chip>
              ))}
            </div>
          </Q>
        )}

        {form.result && (
          <Q label="기억나는 회원의 말" hint="선택 · 그대로 적으면 다음 OT에서 다시 꺼내 써요">
            <input value={form.memberQuote} onChange={(e) => set("memberQuote", e.target.value)} className={inputCls}
              placeholder={form.result === "success" ? "예) 이렇게 다를 줄 몰랐어요" : "예) 한 달에 이 돈이면 좀 부담돼서요"} />
          </Q>
        )}

        {form.result === "continue" && (
          <Q label="다음 OT 날짜" hint="그날 '오늘 할 일'에 떠요">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[["내일", 1], ["3일 뒤", 3], ["1주 뒤", 7]].map(([l, d]) => (
                <Chip key={l} on={form.nextDate === isoAfter(d)} onClick={() => set("nextDate", isoAfter(d))}>{l}</Chip>
              ))}
            </div>
            <input type="date" value={form.nextDate} onChange={(e) => set("nextDate", e.target.value)} className={inputCls} />
          </Q>
        )}
      </Block>

      {/* 2. 오늘 본 것 */}
      <Block n={2} title="오늘 수업에서 본 것" uses="★표시한 운동은 다음 OT에서 '지난번 기억나세요?'로 다시 보여주는 증명 장면이 되고, 세일즈북의 '확인한 변화'가 돼요">
        <Q label="운동별 반응" hint="해당하는 것만 탭">
          {form.moves.length === 0 && (
            <p className="mb-2 text-[12px] text-muted">대본을 만들면 오늘 운동이 여기 미리 채워져요. 아래에서 직접 추가해도 돼요.</p>
          )}
          <div className="space-y-2">
            {form.moves.map((m, i) => (
              <div key={`${m.name}-${i}`} className={`rounded-xl border p-3 ${m.star ? "border-primary/40 bg-primary-soft/40" : "border-line"}`}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{m.name}</span>
                  <button type="button" onClick={() => setMove(i, { star: !m.star })} aria-pressed={m.star}
                    className={`inline-flex min-h-[32px] items-center gap-1 rounded-full px-2.5 text-[12px] font-medium ${m.star ? "bg-primary text-white" : "bg-elevate text-sub hover:text-ink"}`}>
                    <Star className="h-3.5 w-3.5" aria-hidden="true" fill={m.star ? "currentColor" : "none"} /> 다음에 다시
                  </button>
                  <button type="button" onClick={() => removeMove(i)} aria-label={`${m.name} 빼기`} className="rounded-md p-1 text-muted hover:text-ink">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MOVE_TAGS.map((t) => (
                    <Chip key={t.value} tone="primary" on={m.tags.includes(t.value)} onClick={() => toggleMoveTag(i, t.value)}>{t.label}</Chip>
                  ))}
                </div>
                {m.legacy && <p className="mt-1.5 text-[12px] text-muted">예전 기록: {m.legacy}</p>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMove()}
              className={inputCls} placeholder="운동 추가 (예: 힙힌지)" />
            <Button variant="ghost" size="md" onClick={addMove}><Plus className="h-4 w-4" /> 추가</Button>
          </div>
        </Q>

        <Q label="회원 성향" hint="리포트 말투·설명 길이에 반영돼요">
          <div className="flex flex-wrap gap-1.5">
            {ATTITUDE_TAGS.map((t) => (
              <Chip key={t.value} on={form.traits.includes(t.value)} onClick={() => toggleIn("traits", t.value)}>{t.label}</Chip>
            ))}
          </div>
        </Q>
      </Block>

      {/* 3. 다음 OT 방향 */}
      <Block n={3} title="다음 OT 방향" uses="다음 OT 대본의 클로징 근거·플랜 제시·말투가 여기서 정해져요"
        className="@3xl:col-span-2 @6xl:col-span-1" bodyClassName="mt-4 grid gap-4 @3xl:grid-cols-2 @3xl:items-start @6xl:grid-cols-1">
        <Q label="회원이 진짜 원하는 것" hint="처음 말한 목표 말고, 대화하다 알게 된 등록할 이유">
          {member?.goal && member.goal !== "미설정" && (
            <p className="mb-2 text-[12px] text-muted">처음 말한 목표: {member.goal}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {WANT_OPTS.map((o) => (
              <Chip key={o.value} on={form.want === o.value} onClick={() => set("want", form.want === o.value ? "" : o.value)}>{o.label}</Chip>
            ))}
          </div>
          <input value={form.wantWhy} onChange={(e) => set("wantWhy", e.target.value)} className={`${inputCls} mt-2`}
            placeholder="왜? 예) 내년 3월 결혼식 촬영 · 의사가 운동하래요" />
        </Q>

        <Q label="다음 OT에서 등록 제안은" hint={form.push ? undefined : "추천값이 골라져 있어요"}>
          <div className="grid gap-2">
            {NEXT_PUSH_OPTS.map((o) => {
              const on = push === o.value;
              return (
                <button key={o.value} type="button" onClick={() => set("push", o.value)} aria-pressed={on}
                  className={`flex min-h-[48px] items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left transition ${
                    on ? "border-ink bg-ink text-white" : "border-line bg-card hover:border-line-strong"}`}>
                  <span>
                    <span className="block text-[14px] font-semibold">{o.label}{o.value === suggestedPush && <span className={`ml-1.5 text-[12px] font-semibold ${on ? "text-white/70" : "text-primary-strong"}`}>추천</span>}</span>
                    <span className={`block text-[12px] ${on ? "text-white/70" : "text-muted"}`}>{o.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Q>

        <Q label="AI에게 한마디" hint="선택 · 칸에 안 담긴 것" className="@3xl:col-span-2 @6xl:col-span-1">
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} className={`${inputCls} resize-none`}
            placeholder="예) 남편이 반대하는 눈치 · 오전 시간대만 가능" />
        </Q>
      </Block>
      </div>

      <div className="space-y-2">
        <Button variant="primary" size="lg" fullWidth onClick={save} disabled={!canEdit || saving || loading}>
          {saving ? "저장 중…" : "피드백 저장"}
        </Button>
        {missing && !saving && <p className="text-center text-[12px] text-muted">{missing}</p>}
        {savedOnce && form.result === "continue" && (
          <Link href={otStepPath(member.id, "prep", round + 1)}
            className="flex min-h-[52px] items-center justify-between rounded-xl border border-primary/40 bg-primary-soft px-4 font-semibold text-primary-strong no-underline">
            {round + 1}차 OT 준비하기 <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
      </div>

    </div>
    <Toast message={toast} />
    </div>
  );
}

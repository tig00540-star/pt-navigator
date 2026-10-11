"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 링크 */

/* 식단 — 트레이너 창 2개(2026-10-11 · 1단계): 하루 피드백(DietDayModal) · 식단 요청 답(DietRequestModal).
   [AI 초안 보기] = /api/diet(서버 · 한도 'diet') → 고쳐서 [보내기] / [직접 쓰기] → [보내기].
   보내기 = 화면이 RLS로 저장(diet_day.feedback · diet_request.answer · ai=false) + 회원 폰 알림.
   트레이너가 안 하면: 요청 1 · 2번째는 1시간 뒤, 하루 피드백은 그 하루가 끝난 뒤(오전 6시) AI가 트레이너 이름으로 보낸다. */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { notifyPush } from "@/lib/pushClient";
import { dayLabel, timeLabel, dietToday, DIET_AUTO_AFTER_MIN, DIET_AUTO_SEQ } from "@/lib/diet";
import { refreshAiQuota } from "@/lib/useAiQuota";
import { AiQuotaNote } from "@/components/ui/AiQuota";
import { FeedbackBody, AnswerBody } from "@/components/member/DietSection";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

const URL_TTL = 3600;

async function callDiet(body) {
  const res = await fetch("/api/diet", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? d : { error: d.error || "AI가 지금 답하지 못했어요. 다시 시도해 주세요." };
}

/* ── 하루 피드백 ── */
export function DietDayModal({ member, day, onClose, onSent, showToast }) {
  const [meals, setMeals] = useState([]);
  const [urls, setUrls] = useState({});
  const [row, setRow] = useState(null);
  const [mode, setMode] = useState(null);     // null | 'draft' | 'own'
  const [fb, setFb] = useState({ good: "", next: "", timing: "" });
  const [draftMeta, setDraftMeta] = useState(null);   // { totals, target }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, d] = await Promise.all([
        supabase.from("diet_meal").select("*").eq("user_id", member.id).eq("day", day).order("eaten_at", { ascending: true }),
        supabase.from("diet_day").select("*").eq("user_id", member.id).eq("day", day).maybeSingle(),
      ]);
      const ms = m.data || [];
      const paths = ms.map((x) => x.photo_path).filter(Boolean);
      const map = {};
      if (paths.length) {
        const { data: s } = await supabase.storage.from("diet-photos").createSignedUrls(paths, URL_TTL);
        for (const x of s || []) if (x?.signedUrl) map[x.path] = x.signedUrl;
      }
      if (!alive) return;
      setMeals(ms); setUrls(map); setRow(d.data || null);
      if (d.data?.draft && !d.data.feedback) { setMode("draft"); setFb({ good: d.data.draft.good || "", next: d.data.draft.next || "", timing: d.data.draft.timing || "" }); setDraftMeta({ totals: d.data.draft.totals, target: d.data.draft.target }); }
    })();
    return () => { alive = false; };
  }, [member.id, day]);

  const draft = async () => {
    setBusy(true); setErr("");
    const r = await callDiet({ action: "draft_feedback", memberId: member.id, day });
    setBusy(false); refreshAiQuota();
    if (r.error) { setErr(r.error); return; }
    setMode("draft"); setFb({ good: r.feedback.good || "", next: r.feedback.next || "", timing: r.feedback.timing || "" }); setDraftMeta({ totals: r.feedback.totals, target: r.feedback.target });
  };

  const send = async () => {
    if (busy || (!fb.good.trim() && !fb.next.trim())) return;
    setBusy(true); setErr("");
    try {
      const { data: au } = await supabase.auth.getUser();
      const feedback = { ...(mode === "draft" && draftMeta ? draftMeta : { totals: null, target: null }), good: fb.good.trim(), next: fb.next.trim(), timing: fb.timing.trim() };
      const { data, error } = await supabase.from("diet_day").upsert({ user_id: member.id, day, feedback, feedback_at: new Date().toISOString(), feedback_by: au?.user?.id || null, ai: false }, { onConflict: "user_id,day" }).select("day");
      if (error || !data?.length) { console.error("식단 피드백 저장 실패", error); setErr("보내지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
      notifyPush(authHeader(), "diet_feedback", member.id);
      showToast?.("식단 피드백을 보냈어요");
      onSent?.(); onClose();
    } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (busy || !note.trim() || !row?.feedback) return;
    setBusy(true);
    const { data, error } = await supabase.from("diet_day").update({ feedback: { ...row.feedback, note: note.trim().slice(0, 200) } }).eq("user_id", member.id).eq("day", day).select("day");
    setBusy(false);
    if (error || !data?.length) { setErr("저장하지 못했어요. 다시 시도해 주세요."); return; }
    notifyPush(authHeader(), "diet_feedback", member.id);
    showToast?.("한마디를 덧붙였어요");
    onSent?.(); onClose();
  };

  const ended = day < dietToday();
  return (
    <Modal variant="sheet" title={`${member.name} · ${dayLabel(day)} 식단`} onClose={onClose}>
      <div className="space-y-4 break-keep">
        {meals.length === 0 ? <p className="m-0 text-[13px] text-muted">이 날 올린 식단이 없어요.</p> : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {meals.map((m) => (
              <div key={m.id} className="w-[110px] shrink-0">
                {m.photo_path && urls[m.photo_path]
                  ? <img src={urls[m.photo_path]} alt="식단 사진" className="h-[110px] w-[110px] rounded-xl object-cover" />
                  : <div className="flex h-[110px] w-[110px] items-center justify-center rounded-xl bg-elevate p-2 text-center text-[12px] text-sub">{m.memo || "글"}</div>}
                <p className="m-0 mt-1 text-[12px] text-muted">{timeLabel(m.eaten_at)}{m.after_feedback ? " · 피드백 뒤" : ""}</p>
                {m.photo_path && m.memo && <p className="m-0 text-[12px] text-sub">{m.memo}</p>}
                {m.analysis?.items && <p className="m-0 text-[12px] text-sub">{m.analysis.items} · 약 {m.analysis.kcal}kcal</p>}
              </div>
            ))}
          </div>
        )}

        {row?.feedback ? (
          <div className="space-y-2">
            <p className="m-0 text-[12px] font-semibold text-muted">{row.ai ? "AI가 트레이너 이름으로 보냈어요" : "보낸 피드백"} · {timeLabel(row.feedback_at)}</p>
            <FeedbackBody fb={row.feedback} />
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="한마디 덧붙이기" className={inputCls} />
              <Button size="md" onClick={addNote} disabled={busy || !note.trim()}>덧붙이기</Button>
            </div>
          </div>
        ) : mode ? (
          <div className="space-y-2">
            {mode === "draft" && draftMeta?.totals && (
              <p className="m-0 rounded-lg bg-elevate px-3 py-2 text-[13px] text-sub">
                사진 기준 약 {draftMeta.totals.kcal.toLocaleString()}kcal{draftMeta.target?.kcal ? ` / 목표 ${Number(draftMeta.target.kcal).toLocaleString()}` : ""} · 단백질 약 {draftMeta.totals.protein}g
              </p>
            )}
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-muted">잘한 점</span>
              <textarea value={fb.good} onChange={(e) => setFb((x) => ({ ...x, good: e.target.value }))} rows={2} className={inputCls} /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-muted">오늘 하나만</span>
              <textarea value={fb.next} onChange={(e) => setFb((x) => ({ ...x, next: e.target.value }))} rows={2} className={inputCls} /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-muted">먹은 시간(선택)</span>
              <textarea value={fb.timing} onChange={(e) => setFb((x) => ({ ...x, timing: e.target.value }))} rows={1} className={inputCls} /></label>
            <Button variant="primary" fullWidth onClick={send} disabled={busy || (!fb.good.trim() && !fb.next.trim())}>{busy ? "보내는 중…" : "보내기"}</Button>
          </div>
        ) : meals.length > 0 ? (
          <div className="space-y-2">
            <Button variant="primary" fullWidth onClick={draft} disabled={busy}><Sparkles className="h-4 w-4" aria-hidden="true" /> {busy ? "만드는 중… 20초쯤 걸려요" : "AI 초안 보고 보내기"}</Button>
            <Button fullWidth onClick={() => setMode("own")} disabled={busy}>직접 쓰기</Button>
            <p className="m-0 text-center text-[12px] text-muted">{ended ? "그냥 두면 곧 AI가 트레이너 이름으로 보내요." : "그냥 두면 하루가 끝나는 오전 6시에 AI가 트레이너 이름으로 보내요."}</p>
            <AiQuotaNote kind="diet" className="text-center" />
          </div>
        ) : null}
        {err && <p className="m-0 text-[13px] text-danger-text">{err}</p>}
      </div>
    </Modal>
  );
}

/* ── 식단 요청 답 ── */
export function DietRequestModal({ member, req, onClose, onSent, showToast }) {
  const [mode, setMode] = useState(null);   // null | 'draft' | 'own'
  const [ans, setAns] = useState(null);     // { intro, plan[], closing }
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const autoAt = req.seq <= DIET_AUTO_SEQ ? Date.parse(req.created_at) + DIET_AUTO_AFTER_MIN * 60000 : null;
  const [nowMs] = useState(() => new Date().getTime());
  const minsLeft = autoAt ? Math.max(0, Math.ceil((autoAt - nowMs) / 60000)) : null;

  const draft = async () => {
    setBusy(true); setErr("");
    const r = await callDiet({ action: "draft_request", requestId: req.id });
    setBusy(false); refreshAiQuota();
    if (r.error) { setErr(r.error); return; }
    setMode("draft"); setAns(r.answer);
  };
  const save = async (patch, msg) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const { data: au } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("diet_request").update({ ...patch, answered_at: new Date().toISOString(), answered_by: au?.user?.id || null, ai: false })
        .eq("id", req.id).eq("status", "open").select("id");
      if (error || !data?.length) { console.error("식단 답 저장 실패", error); setErr("보내지 못했어요. 이미 답했거나 권한이 없을 수 있어요."); return; }
      if (patch.status === "answered") notifyPush(authHeader(), "diet_answer", member.id);
      showToast?.(msg); onSent?.(); onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal variant="sheet" title={`${member.name} · 식단 요청`} onClose={onClose}>
      <div className="space-y-4 break-keep">
        <div className="rounded-xl bg-elevate px-3 py-2.5 text-[14px] text-ink">
          <b>{req.scope === "today" ? "오늘 남은 끼니" : "이번 주"}</b>{req.situations?.length ? ` · ${req.situations.join(", ")}` : ""}
          {req.note && <p className="m-0 mt-1 text-[13px] text-sub">&ldquo;{req.note}&rdquo;</p>}
          <p className="m-0 mt-1 text-[12px] text-muted">오늘 {req.seq}번째 요청 · {timeLabel(req.created_at)}</p>
        </div>
        {req.status !== "open" ? (
          <div className="space-y-2">
            <p className="m-0 text-[12px] font-semibold text-muted">{req.ai ? "AI가 트레이너 이름으로 보냈어요" : req.status === "skipped" ? "넘겼어요" : "보낸 답"}</p>
            <AnswerBody answer={req.answer} />
          </div>
        ) : mode === "draft" && ans ? (
          <div className="space-y-2">
            <textarea value={ans.intro} onChange={(e) => setAns((a) => ({ ...a, intro: e.target.value }))} rows={2} className={inputCls} />
            {ans.plan.map((p, i) => (
              <label key={i} className="block"><span className="mb-1 block text-[12px] font-semibold text-muted">{p.title}</span>
                <textarea value={p.items} onChange={(e) => setAns((a) => ({ ...a, plan: a.plan.map((x, j) => (j === i ? { ...x, items: e.target.value } : x)) }))} rows={2} className={inputCls} /></label>
            ))}
            <textarea value={ans.closing} onChange={(e) => setAns((a) => ({ ...a, closing: e.target.value }))} rows={1} className={inputCls} />
            <Button variant="primary" fullWidth onClick={() => save({ status: "answered", answer: ans }, "식단을 보냈어요")} disabled={busy}>{busy ? "보내는 중…" : "보내기"}</Button>
          </div>
        ) : mode === "own" ? (
          <div className="space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="예: 저녁은 회식이면 고기 위주로, 밥은 반 공기만 드세요. 술은 맥주 한 잔까지요." className={inputCls} />
            <Button variant="primary" fullWidth onClick={() => save({ status: "answered", answer: { text: text.trim() } }, "식단을 보냈어요")} disabled={busy || !text.trim()}>{busy ? "보내는 중…" : "보내기"}</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button variant="primary" fullWidth onClick={draft} disabled={busy}><Sparkles className="h-4 w-4" aria-hidden="true" /> {busy ? "만드는 중… 20초쯤 걸려요" : "AI 초안 보고 보내기"}</Button>
            <Button fullWidth onClick={() => setMode("own")} disabled={busy}>직접 쓰기</Button>
            {req.seq > DIET_AUTO_SEQ
              ? <Button variant="ghost" fullWidth onClick={() => save({ status: "skipped" }, "요청을 넘겼어요")} disabled={busy}>넘기기(회원과 직접 이야기할게요)</Button>
              : null}
            <p className="m-0 text-center text-[12px] text-muted">{minsLeft != null ? (minsLeft > 0 ? `${minsLeft}분 안에 안 보내면 AI가 트레이너 이름으로 보내요.` : "곧 AI가 트레이너 이름으로 보내요.") : "3번째 요청은 직접 답해 주세요."}</p>
            <AiQuotaNote kind="diet" className="text-center" />
          </div>
        )}
        {err && <p className="m-0 text-[13px] text-danger-text">{err}</p>}
      </div>
    </Modal>
  );
}

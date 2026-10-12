"use client";

/* 식단 — 트레이너 '오늘' 카드(2026-10-11 · 1단계). 받은 members(내 담당) 중 식단 관리를 켠 회원만.
   ① 식단 요청(열린 것 · 'N분 뒤 AI' / 3번째는 '직접 답하기') ② 식단 피드백 대기(끝 누름 · 끝난 하루 · '오전 6시 AI')
   ③ 어제 AI가 보낸 피드백('한마디' 덧붙이기) ④ 사진 없이 3일 연속(폰 알림 없이 이 카드로만 · 대표 결정).
   열 때 /api/diet {action:'auto'}를 한 번 부른다 — 기다리지 않고 먼저 지금 것을 보여 주고, AI가 대신 보낸 게 있으면 끝난 뒤 한 번 다시 읽는다.
   그저께 이전 요청은 AI가 더는 안 맡으므로 '직접 답하기' · 식단 AI 한도를 다 썼으면 'AI 한도 끝'(2026-10-12).
   누르면 그 회원 케어 탭(식단 카드). 표 없거나(SQL 전) 할 게 없으면 숨김. */

import { useEffect, useState } from "react";
import { Salad } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { fetchByIds } from "@/lib/fetchByIds";
import { dietToday, addDays, DIET_AUTO_AFTER_MIN, DIET_AUTO_SEQ } from "@/lib/diet";
import { useAiLocked } from "@/components/ui/AiQuota";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import ListRow from "@/components/ui/ListRow";

export default function DietToday({ members = [], onSelect }) {
  const [rows, setRows] = useState(null);
  const aiOut = useAiLocked("diet");   // 식단 AI를 다 썼으면 '곧 AI' 대신 직접 답하기
  const key = (members || []).filter((m) => m && !m.hidden && m.status === "pt_active").map((m) => m.id).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const ids = key ? key.split(",") : [];
      if (!ids.length) { if (!cancelled) setRows([]); return; }
      const { data: plans, error } = await fetchByIds(supabase, "diet_plan", "member_id, started_on", "member_id", ids, (q) => q.eq("enabled", true), { orderColumn: "member_id" });
      if (error || !plans?.length) { if (!cancelled) setRows([]); return; }
      const on = plans.map((p) => p.member_id);
      await read(plans, on);
      // 트레이너가 안 한 답 · 피드백 → AI가 대신(몇 분 걸릴 수 있어 기다리지 않음 · 보낸 게 있으면 한 번 다시 읽음)
      (async () => {
        try {
          const res = await fetch("/api/diet", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action: "auto" }) });
          const j = await res.json().catch(() => null);
          if (!cancelled && (!j || j.requests || j.feedbacks)) await read(plans, on);
        } catch { /* 다음에 */ }
      })();
    })();
    async function read(plans, on) {
      const today = dietToday();
      const [rq, dy, ml] = await Promise.all([
        fetchByIds(supabase, "diet_request", "id, user_id, seq, scope, day, created_at", "user_id", on, (q) => q.eq("status", "open")),
        fetchByIds(supabase, "diet_day", "user_id, day, closed_at, feedback, ai, feedback_at", "user_id", on, (q) => q.gte("day", addDays(today, -1)), { orderColumn: "user_id" }),
        fetchByIds(supabase, "diet_meal", "user_id, day", "user_id", on, (q) => q.gte("day", addDays(today, -2))),
      ]);
      const now = new Date().getTime();
      const out = [];
      for (const q of rq.data || []) {
        // AI가 맡는 건 1 · 2번째 · 어제 이후 요청만(lib/dietAI runDietAuto) — 그 전 것은 늘 '직접 답하기'
        const auto = q.seq <= DIET_AUTO_SEQ && !(q.day && q.day < addDays(today, -1));
        const left = auto ? Math.max(0, Math.ceil((Date.parse(q.created_at) + DIET_AUTO_AFTER_MIN * 60000 - now) / 60000)) : null;
        const when = q.day && q.day !== today ? (q.day === addDays(today, -1) ? "어제 " : "지난 ") : "";
        out.push({ id: `rq-${q.id}`, reqId: q.id, member: q.user_id, kind: "req", aiTag: left != null, text: `${when}식단 요청 · ${q.scope === "today" ? (when ? "그날 남은 끼니" : "오늘 남은 끼니") : "이번 주"}`, tag: left == null ? "직접 답하기" : left > 0 ? `${left}분 뒤 AI` : "곧 AI" });
      }
      const mealsBy = new Map();
      for (const x of ml.data || []) mealsBy.set(`${x.user_id}|${x.day}`, (mealsBy.get(`${x.user_id}|${x.day}`) || 0) + 1);
      for (const d of dy.data || []) {
        if (!d.feedback && d.closed_at && d.day === today) out.push({ id: `wait-${d.user_id}`, day: d.day, member: d.user_id, kind: "wait", text: "오늘 식단을 다 올렸어요 · 하루 피드백", tag: "오전 6시 AI" });
        if (d.feedback && d.ai && d.day === addDays(today, -1)) out.push({ id: `ai-${d.user_id}`, day: d.day, member: d.user_id, kind: "ai", text: "어제 피드백을 AI가 보냈어요", tag: "한마디" });
      }
      // 어제 끼니가 있는데 피드백이 아직(자동이 한도 등으로 못 보냄)
      for (const id of on) {
        const yd = addDays(today, -1);
        if (mealsBy.get(`${id}|${yd}`) && !(dy.data || []).some((d) => d.user_id === id && d.day === yd && d.feedback)) out.push({ id: `late-${id}`, day: yd, member: id, kind: "late", text: "어제 식단 피드백이 아직이에요", tag: "직접 보내기" });
      }
      // 사진 없이 3일 연속(켠 지 3일 넘은 회원만)
      for (const p of plans) {
        if (p.started_on > addDays(today, -3)) continue;
        const none = [0, 1, 2].every((i) => !mealsBy.get(`${p.member_id}|${addDays(today, -i)}`));
        if (none) out.push({ id: `gap-${p.member_id}`, member: p.member_id, kind: "gap", text: "식단 기록이 3일째 끊겼어요", tag: "한마디 하기" });
      }
      if (!cancelled) setRows(out);
    }
    return () => { cancelled = true; };
  }, [key]);

  if (!rows?.length) return null;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "회원";
  // 한도를 다 썼으면 AI가 대신 못 보낸다 → 'N분 뒤 AI' · '오전 6시 AI' 대신 직접
  const tagOf = (r) => (aiOut && (r.aiTag || r.kind === "wait") ? "AI 한도 끝 · 직접 답하기" : r.tag);
  const tagCls = (r) => (r.kind === "req" && r.aiTag && !aiOut ? "bg-amber-50 text-amber-700" : r.kind === "ai" ? "bg-elevate text-sub" : "bg-primary-soft text-primary-strong");

  return (
    <ToneCard tone="renewal">
      <SectionHeader tone="renewal" icon={Salad} title="식단" count={rows.length} hint="안 보내도 요청 1 · 2번째는 1시간 뒤, 하루 피드백은 오전 6시에 AI가 트레이너 이름으로 보내요." />
      <div className="grid gap-2">
        {rows.map((r) => (
          <ListRow key={r.id} tone="renewal" name={nameOf(r.member)} onClick={() => {
            // 케어 탭 식단 카드가 이 요청 · 이 날 창을 바로 연다(DietCard)
            try { if (r.reqId || r.day) sessionStorage.setItem("ot.dietOpen", JSON.stringify({ member: r.member, reqId: r.reqId || null, day: r.day || null, at: Date.now() })); } catch { /* 없어도 케어 탭까지는 간다 */ }
            onSelect?.(r.member, 13);
          }}>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[12.5px] text-sub">
              <span>{r.text}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${tagCls(r)}`}>{tagOf(r)}</span>
            </div>
          </ListRow>
        ))}
      </div>
    </ToneCard>
  );
}

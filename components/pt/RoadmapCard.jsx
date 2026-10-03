"use client";

/* 목표 로드맵 — PT 회원 대시보드 카드(2026-10-03). 회원 전용 페이지 '내 PT'의 '나의 목표 로드맵'을 여기서 만든다.
   · 처음엔 꺼진 상태(없음) → '로드맵 만들기' 안내(대표 결정). AI 초안(phase "roadmap" · 트레이너가 고친 뒤 저장) 또는 직접 만들기.
   · 회원에게 보이기는 트레이너가 켤 때만. 단계 이동도 트레이너가 '다음 단계로'를 눌러서(자동 이동 없음).
   · 저장: member_roadmap(회원당 1행 · upsert · 센터 범위 RLS · docs/migrations/2026-10-03-member-pt-status.sql).
   표가 아직 없으면(SQL 전) 카드를 숨긴다. */

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Flag, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { buildExerciseSeries } from "@/lib/workout";
import { INBODY_FIELDS } from "@/lib/labels";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const emptyStage = () => ({ title: "", detail: "" });
const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-[14px] text-ink outline-none focus:border-primary";

export default function RoadmapCard({ member, contracts = [], logs = [] }) {
  const { toast, showToast } = useToast();
  const [row, setRow] = useState(undefined);   // undefined=불러오는 중 · null=없음 · false=표 없음
  const [edit, setEdit] = useState(null);      // 편집 중 초안 { title, stages, current }
  const [busy, setBusy] = useState("");        // "ai" | "save" | ""

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { setRow(false); return; }
      const { data, error } = await supabase.from("member_roadmap").select("*").eq("member_id", member.id).maybeSingle();
      if (cancelled) return;
      if (error) { console.error("로드맵 조회 실패", error); setRow(false); return; }
      setRow(data || null);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  if (row === undefined || row === false) return null;

  const save = async (next, msg) => {
    setBusy("save");
    try {
      const payload = {
        member_id: member.id, title: next.title?.trim() || null,
        stages: next.stages.map((s) => ({ title: s.title.trim(), detail: s.detail.trim() })).filter((s) => s.title),
        current: Math.max(0, Math.min(next.current ?? 0, Math.max(0, next.stages.length - 1))),
        visible: next.visible ?? row?.visible ?? false,
        ai_meta: next.ai_meta ?? row?.ai_meta ?? null,
        updated_at: new Date().toISOString(),
      };
      if (!payload.stages.length) { showToast("단계를 하나 이상 입력해 주세요."); return false; }
      const { data, error } = await supabase.from("member_roadmap").upsert(payload, { onConflict: "member_id" }).select();
      if (error || !data?.length) { console.error("로드맵 저장 실패", error); showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return false; }
      setRow(data[0]);
      if (msg) showToast(msg);
      return true;
    } catch (e) {
      console.error(e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const aiDraft = async () => {
    setBusy("ai");
    try {
      const done = logs.filter((l) => !l.voided && l.source !== "noshow");
      const dts = done.map((l) => Date.parse(l.session_at ?? l.created_at)).filter((x) => !Number.isNaN(x));
      const months = dts.length >= 2 ? Math.max(1, Math.round((Math.max(...dts) - Math.min(...dts)) / (86400000 * 30.4))) : null;
      const { data: ib } = await supabase.from("inbody_log").select("*").eq("user_id", member.id).order("measured_at", { ascending: true });
      const inbody_change = INBODY_FIELDS.map((f) => {
        const v = (ib || []).filter((r) => r[f.key] != null);
        return v.length >= 2 && v[0][f.key] !== v.at(-1)[f.key] ? { label: f.label, first: v[0][f.key], latest: v.at(-1)[f.key], unit: f.unit } : null;
      }).filter(Boolean);
      const weight_change = buildExerciseSeries(logs)
        .map((sr) => ({ exercise: sr.exercise, first: sr.points[0]?.topWeight ?? null, latest: sr.points.at(-1)?.topWeight ?? null }))
        .filter((e) => e.first != null && e.latest != null && e.first !== e.latest).slice(0, 5);
      const withBrief = [...contracts].filter((c) => c?.report?.reg_brief).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
      const wn = withBrief?.report?.reg_brief?.why_now || {};
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "roadmap", member, ptContext: { sessions_done: done.length, months, inbody_change, weight_change, next_roadmap: wn.next_roadmap || null, future_change: wn.future_change || null } }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); console.error("로드맵 초안 실패", d); showToast("초안을 만들지 못했어요. 다시 시도해 주세요."); return; }
      const d = await res.json();
      const stages = (Array.isArray(d.stages) ? d.stages : []).filter((s) => s && s.title).slice(0, 6).map((s) => ({ title: String(s.title), detail: String(s.detail || "") }));
      if (!stages.length) { showToast("초안을 만들지 못했어요. 다시 시도해 주세요."); return; }
      setEdit({ title: d.title || "", stages, current: Number.isInteger(d.current) ? d.current : 0, ai_meta: { generatedAt: new Date().toISOString() } });
    } catch (e) {
      console.error(e);
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  };

  // ── 편집 화면 ──
  if (edit) {
    const set = (patch) => setEdit((e) => ({ ...e, ...patch }));
    const setStage = (i, patch) => set({ stages: edit.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    const move = (i, d) => { const st = [...edit.stages]; const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; set({ stages: st }); };
    return (
      <Card as="section">
        <SectionTitle icon={Flag}>목표 로드맵 {row ? "고치기" : "만들기"}</SectionTitle>
        <label className="block">
          <span className="mb-1 block text-[13px] text-sub">로드맵 제목 (회원 목표 한 줄)</span>
          <input value={edit.title} onChange={(e) => set({ title: e.target.value })} maxLength={40} className={inputCls} placeholder="예: 체지방 줄이고 체력 키우기" />
        </label>
        <p className="mb-2 mt-4 text-[13px] text-sub">단계 (지금 단계를 동그라미로 골라요)</p>
        <ol className="m-0 list-none space-y-2 p-0">
          {edit.stages.map((s, i) => (
            <li key={i} className={`rounded-xl px-3 py-2.5 ${edit.current === i ? "bg-primary-soft" : "bg-elevate"}`}>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => set({ current: i })} aria-label={`${i + 1}단계를 지금 단계로`}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${edit.current === i ? "bg-primary text-white" : i < edit.current ? "bg-primary/70 text-white" : "border border-line bg-card text-muted"}`}>
                  {i < edit.current ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </button>
                <input value={s.title} onChange={(e) => setStage(i, { title: e.target.value })} maxLength={30} className={inputCls} placeholder="단계 이름 (예: 자세 잡기)" />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sub disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === edit.stages.length - 1} aria-label="아래로" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sub disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => set({ stages: edit.stages.filter((_, j) => j !== i), current: Math.min(edit.current, Math.max(0, edit.stages.length - 2)) })} aria-label="단계 빼기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-danger-text"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input value={s.detail} onChange={(e) => setStage(i, { detail: e.target.value })} maxLength={80} className={`${inputCls} mt-1.5`} placeholder="이 단계를 지나면 달라지는 것 한 줄 (회원이 읽어요)" />
            </li>
          ))}
        </ol>
        {edit.stages.length < 6 && (
          <button type="button" onClick={() => set({ stages: [...edit.stages, emptyStage()] })} className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-[13px] font-semibold text-primary-strong">
            <Plus className="h-4 w-4" aria-hidden="true" /> 단계 추가
          </button>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setEdit(null)} className="min-h-[40px] rounded-lg px-4 text-[14px] text-sub hover:text-ink">취소</button>
          <button type="button" disabled={busy === "save"} onClick={async () => { if (await save(edit, "로드맵을 저장했어요")) setEdit(null); }}
            className="min-h-[40px] rounded-lg bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-60">{busy === "save" ? "저장 중…" : "저장"}</button>
        </div>
        <p className="mt-2 text-[12px] text-muted">저장해도 회원에게는 아직 안 보여요. 저장한 뒤 &lsquo;회원에게 보이기&rsquo;를 켜면 회원 전용 페이지에 나와요.</p>
        <Toast message={toast} />
      </Card>
    );
  }

  // ── 아직 없음: 만들기 안내 ──
  if (!row) {
    return (
      <Card as="section">
        <SectionTitle icon={Flag}>목표 로드맵</SectionTitle>
        <p className="-mt-1.5 text-[13px] leading-relaxed text-sub">
          회원 전용 페이지에 &lsquo;지금 몇 단계이고 앞으로 무엇이 남았는지&rsquo;를 보여 줘요. 남은 단계가 보이면 회원이 먼저 다음을 생각해요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={aiDraft} disabled={busy === "ai"}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-semibold text-white disabled:opacity-60">
            {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {busy === "ai" ? "초안 만드는 중…" : "AI 초안 만들기"}
          </button>
          <button type="button" onClick={() => setEdit({ title: member?.goal && member.goal !== "-" ? member.goal : "", stages: [emptyStage(), emptyStage(), emptyStage()], current: 0 })}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-card px-4 text-[14px] font-semibold text-ink">
            <Pencil className="h-4 w-4" aria-hidden="true" /> 직접 만들기
          </button>
        </div>
        <Toast message={toast} />
      </Card>
    );
  }

  // ── 보기 ──
  const stages = Array.isArray(row.stages) ? row.stages : [];
  const cur = Math.min(Math.max(row.current ?? 0, 0), Math.max(0, stages.length - 1));
  return (
    <Card as="section">
      <SectionTitle icon={Flag} aside={row.visible ? "회원에게 보이는 중" : "회원에게 안 보임"}>목표 로드맵</SectionTitle>
      {row.title && <p className="-mt-1.5 mb-3 text-[13px] text-sub">{row.title}</p>}
      <ol className="m-0 list-none space-y-1.5 p-0">
        {stages.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i < cur ? "bg-primary text-white" : i === cur ? "border-2 border-primary bg-card text-primary-strong" : "border border-line bg-card text-muted"}`}>
              {i < cur ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`text-[14px] ${i === cur ? "font-bold text-ink" : "text-sub"}`}>{s.title}</span>
              {i === cur && <span className="ml-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11.5px] font-semibold text-primary-strong">지금</span>}
              {i === cur && s.detail && <span className="mt-0.5 block text-[12.5px] text-sub">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy === "save"} onClick={() => save({ ...row, stages, visible: !row.visible }, row.visible ? "회원에게 안 보이게 했어요" : "회원 전용 페이지에 보이게 했어요")}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 text-[14px] font-semibold disabled:opacity-60 ${row.visible ? "border border-line bg-card text-sub" : "bg-primary text-white"}`}>
          {row.visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          {row.visible ? "회원에게 안 보이기" : "회원에게 보이기"}
        </button>
        {cur < stages.length - 1 && (
          <button type="button" disabled={busy === "save"} onClick={() => save({ ...row, stages, current: cur + 1 }, `${cur + 2}단계로 넘어갔어요`)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-card px-4 text-[14px] font-semibold text-ink disabled:opacity-60">
            다음 단계로 ▶
          </button>
        )}
        <button type="button" onClick={() => setEdit({ title: row.title || "", stages: stages.map((s) => ({ title: s.title || "", detail: s.detail || "" })), current: cur })}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-[14px] text-sub hover:text-ink">
          <Pencil className="h-4 w-4" aria-hidden="true" /> 고치기
        </button>
      </div>
      <Toast message={toast} />
    </Card>
  );
}

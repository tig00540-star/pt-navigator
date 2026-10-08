"use client";

/* 대표 운영 탭 '트레이너 아이디 관리'(2026-10-08 · 분리 방식 — 센터 트레이너 아이디는 센터 것 · 끈 아이디는 한 달 보관 lib/trainerClose).
   · 트레이너마다 [끄기] / [다시 켜기](/api/trainer-active · 끄면 앱 접근이 막히고 자리가 빈다 · 켤 때 자리 확인)
   · 꺼진 트레이너 담당으로 남은 회원(PT · OT 모두) → 받을 트레이너 골라 [한꺼번에 넘기기](lib/handover · 남은 수업 · 잡힌 예약 함께)
   단가가 없어 이월계약을 못 만드는 회원은 건너뛰고 이름을 알려 준다(한 명씩 '회원 재배정'으로). */

import { useMemo, useState } from "react";
import { UserX } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { personName } from "@/lib/format";
import { handoverMember } from "@/lib/handover";
import { trainerCloseAt, kstDay, TRAINER_KEEP_DAYS } from "@/lib/trainerClose";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";

export default function TrainerOffboard({ trainers = [], members = [], contracts = [], logs = [], onTrainersChanged, onMembersChanged }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [to, setTo] = useState({});      // 꺼진 트레이너 id → 받을 트레이너 id
  const [progress, setProgress] = useState("");
  const [now] = useState(() => Date.now());   // 보관 기한 비교용(렌더 중 Date.now 금지)

  const staff = trainers.filter((t) => t.role === "trainer" && !t.closed_at);   // 정리된 아이디는 목록에서 뺀다(담당 회원은 아래 넘기기에 남음)
  const closeAt = (t) => trainerCloseAt(t.deactivated_at);
  const canReopen = (t) => t.active === false && !t.closed_at && (!closeAt(t) || closeAt(t) > now);
  const activeIds = new Set(trainers.filter((t) => t.active !== false).map((t) => t.id));
  const receivers = trainers.filter((t) => t.active !== false);

  // 담당이 꺼졌거나 센터에 없는 회원(숨김 · 지난 회원 제외)
  const orphans = useMemo(() => {
    const by = new Map();
    for (const m of members) {
      if (!m || m.hidden || m.status === "inactive" || !m.trainer_id || activeIds.has(m.trainer_id)) continue;
      if (!by.has(m.trainer_id)) by.set(m.trainer_id, []);
      by.get(m.trainer_id).push(m);
    }
    return [...by.entries()].map(([tid, list]) => ({ tid, name: personName(trainers.find((t) => t.id === tid)?.name) || "센터를 떠난 트레이너", list }));
  }, [members, trainers]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!staff.length && !orphans.length) return null;

  const setActive = async (t, active) => {
    if (busy) return;
    if (!active && !window.confirm(`${personName(t.name)} 트레이너 아이디를 끌까요?\n\n· 바로 앱을 못 쓰게 되고 자리가 비어요.\n· 회원 · 기록은 센터에 그대로 남아요. 아래에서 다른 트레이너에게 넘겨 주세요.\n· 언제든 다시 켤 수 있어요.`)) return;
    setBusy(t.id); setMsg("");
    try {
      const res = await fetch("/api/trainer-active", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ trainerId: t.id, active }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || "저장하지 못했어요. 다시 시도해 주세요."); return; }
      setMsg(active ? `${personName(t.name)} 트레이너를 다시 켰어요.` : `${personName(t.name)} 트레이너를 껐어요. 담당 회원을 넘겨 주세요.`);
      onTrainersChanged?.();
    } catch {
      setMsg("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { setBusy(""); }
  };

  const moveAll = async (g) => {
    const target = to[g.tid];
    if (!target || busy || !supabase) { if (!target) setMsg("받을 트레이너를 골라 주세요."); return; }
    const tname = personName(trainers.find((t) => t.id === target)?.name);
    if (!window.confirm(`${g.name} 담당 회원 ${g.list.length}명을 ${tname} 트레이너에게 넘길까요?\n남은 수업과 잡힌 예약도 같이 넘어가요.`)) return;
    setBusy(g.tid); setMsg("");
    const failed = [];
    let ok = 0;
    for (let i = 0; i < g.list.length; i++) {
      const m = g.list[i];
      setProgress(`${i + 1} / ${g.list.length}`);
      try {
        const r = await handoverMember(supabase, { member: m, toTrainerId: target, contracts, logs });
        if (r.ok) ok++; else failed.push(`${m.name}(${r.msg})`);
      } catch {
        failed.push(`${m.name}(인터넷 연결 확인)`);
      }
    }
    setProgress(""); setBusy("");
    setMsg(failed.length
      ? `${ok}명을 넘겼어요. ${failed.length}명은 넘기지 못했어요: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? " 외" : ""}. 이 회원은 위 '회원 재배정'으로 한 명씩 넘겨 주세요.`
      : `${ok}명을 ${tname} 트레이너에게 넘겼어요.`);
    onMembersChanged?.();
  };

  return (
    <Card padding="lg">
      <SectionTitle icon={UserX}>트레이너 아이디 관리</SectionTitle>
      <p className="m-0 text-[14px] leading-relaxed text-sub">
        센터에서 만든 트레이너 아이디와 회원 기록은 <b className="text-ink">센터 것</b>이에요. 트레이너가 그만두면 아이디를 끄고, 담당 회원을 다른 트레이너에게 넘겨 주세요. 끈 아이디는 {TRAINER_KEEP_DAYS}일 뒤 정리돼요. 새 트레이너에게는 옛 아이디 대신 새 아이디를 만들어 주세요.
      </p>

      {staff.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
          {staff.map((t) => (
            <li key={t.id} className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 rounded-xl bg-elevate px-3.5 py-2">
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-ink">{personName(t.name)}{t.active === false && <span className="ml-1.5 text-[13px] font-semibold text-muted">꺼짐</span>}</span>
                {t.active === false && closeAt(t) && (
                  <span className="block text-[12.5px] text-sub">{closeAt(t) > now ? `${kstDay(closeAt(t))}까지 보관 · 같은 사람이 돌아왔을 때만 다시 켜기` : "곧 정리돼요 · 다시 켤 수 없어요"}</span>
                )}
              </span>
              {(t.active !== false || canReopen(t)) && (
                <button type="button" disabled={Boolean(busy)} onClick={() => setActive(t, t.active === false)}
                  className="min-h-[36px] shrink-0 rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-sub disabled:opacity-50">
                  {busy === t.id ? "바꾸는 중…" : t.active === false ? "다시 켜기" : "아이디 끄기"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {orphans.map((g) => (
        <div key={g.tid} className="mt-4 rounded-xl border border-line px-3.5 py-3">
          <p className="m-0 text-[14px] font-bold text-ink">{g.name} 담당 회원 {g.list.length}명이 남아 있어요</p>
          <p className="m-0 mt-0.5 text-[13px] text-sub">{g.list.slice(0, 6).map((m) => m.name).join(", ")}{g.list.length > 6 ? ` 외 ${g.list.length - 6}명` : ""}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <select value={to[g.tid] || ""} onChange={(e) => setTo((p) => ({ ...p, [g.tid]: e.target.value }))} disabled={Boolean(busy)} aria-label="받을 트레이너"
              className={`${inputCls} min-w-[140px] flex-1`}>
              <option value="">받을 트레이너 선택하세요</option>
              {receivers.map((t) => <option key={t.id} value={t.id}>{personName(t.name)}{t.role === "owner" ? "(대표)" : ""}</option>)}
            </select>
            <Button variant="primary" size="md" onClick={() => moveAll(g)} disabled={Boolean(busy)}>
              {busy === g.tid ? `넘기는 중 ${progress}` : "한꺼번에 넘기기"}
            </Button>
          </div>
        </div>
      ))}

      {msg && <p className="m-0 mt-3 text-[13.5px] font-semibold leading-relaxed text-ink">{msg}</p>}
    </Card>
  );
}

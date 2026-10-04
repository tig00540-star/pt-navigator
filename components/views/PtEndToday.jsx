"use client";

/* PT 종료 처리할까요? — 남은 수업이 0이 된 PT 회원(2026-10-05).
   [PT 종료] → 지난 회원(status inactive) · 회원 전용 페이지는 그날부터 6개월 동안 볼 수만 있다(DB가 쓰기를 막음).
   [7일 뒤 다시 알림] → user_table.pt_end_snooze_until(재등록 상담 중일 때).
   대상: 계약이 1개 이상 있고 잔여 있는 계약이 하나도 없는 PT 회원(미리 재등록해 다음 계약이 기다리면 대상 아님).
   보이는 곳: '오늘' 탭 · 폰 홈(있을 때만) · 넓은 홈. 받은 members(내 담당 · 호출부가 거름) 안에서만. */

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { viewFor, activeContract, toInactive } from "@/lib/memberStatus";
import { useMembers } from "@/components/app/MembersProvider";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const SNOOZE_DAYS = 7;
const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

export default function PtEndToday({ members = [], onSelect }) {
  const { onMemberPatch } = useMembers();
  const [rows, setRows] = useState([]);
  const [asking, setAsking] = useState(null); // 확인 중인 회원 id
  const [busy, setBusy] = useState(null);
  const { toast, showToast } = useToast();

  const [now] = useState(() => Date.now()); // 화면을 연 시각 기준(미루기 판정 · 렌더마다 바뀌지 않게)
  const ptKey = (members || [])
    .filter((m) => m && !m.hidden && viewFor(m) === "pt" && !(m.pt_end_snooze_until && Date.parse(m.pt_end_snooze_until) > now))
    .map((m) => m.id).sort().join(",");

  useEffect(() => {
    if (!supabase) return;
    const ids = ptKey ? ptKey.split(",") : [];
    let cancelled = false;
    (async () => {
      if (!ids.length) { if (!cancelled) setRows([]); return; }
      const [{ data: cs, error: ce }, { data: ls, error: le }] = await Promise.all([
        supabase.from("session_log").select("id, user_id, started_at, sessions_total, service_sessions, handed_over").in("user_id", ids),
        supabase.from("daily_workout_log").select("user_id, contract_id, voided, session_at, created_at").in("user_id", ids),
      ]);
      if (ce || le) { console.error("PT 종료 대상 조회 실패", ce || le); return; }
      if (cancelled) return;
      const out = [];
      for (const id of ids) {
        const mc = (cs || []).filter((c) => c.user_id === id);
        if (!mc.length) continue;
        const ml = (ls || []).filter((l) => l.user_id === id);
        if (activeContract(mc, ml)) continue;
        const last = ml.filter((l) => !l.voided).map((l) => l.session_at || l.created_at).sort().pop() || null;
        out.push({ user_id: id, last });
      }
      out.sort((a, b) => (a.last || "").localeCompare(b.last || ""));
      setRows(out);
    })();
    return () => { cancelled = true; };
  }, [ptKey]);

  const visible = rows.filter((r) => ptKey.split(",").includes(r.user_id));
  if (!visible.length) return <Toast message={toast} />;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "회원";

  const update = async (id, patch, done) => {
    if (busy) return;
    if (!supabase) { onMemberPatch?.(id, patch); showToast(done); return; }
    setBusy(id);
    try {
      const { data, error } = await supabase.from("user_table").update(patch).eq("id", id).select("id");
      if (error || !data || data.length === 0) {
        console.error("PT 종료 처리 실패", error);
        showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
        return;
      }
      onMemberPatch?.(id, patch);
      setAsking(null);
      showToast(done);
    } catch {
      showToast("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const endPt = (id) => update(id, { ...toInactive(null, "남은 수업 0회"), pt_end_snooze_until: null }, "PT를 종료했어요. 회원 페이지는 6개월 동안 볼 수만 있어요.");
  const snooze = (id) => update(id, { pt_end_snooze_until: new Date(Date.now() + SNOOZE_DAYS * 86400000).toISOString() }, `${SNOOZE_DAYS}일 뒤에 다시 알려 드릴게요.`);

  return (
    <ToneCard tone="renewal">
      <SectionHeader tone="renewal" icon={Flag} title="PT 종료 처리할까요?" count={visible.length} hint="남은 수업이 0회예요. 재등록 상담 중이면 7일 뒤에 다시 알려 드려요." />
      <div className="grid gap-2">
        {visible.map((r) => (
          <div key={r.user_id} className="rounded-xl bg-elevate px-3.5 py-3">
            <button type="button" onClick={() => onSelect?.(r.user_id)} className="block w-full text-left">
              <div className="text-[15px] font-semibold text-ink">{nameOf(r.user_id)}</div>
              <div className="mt-0.5 text-[12.5px] text-sub">{r.last ? `마지막 수업 ${md(r.last)}` : "수업 기록 없음"}</div>
            </button>
            {asking === r.user_id ? (
              <div className="mt-2.5">
                <p className="text-[13px] leading-relaxed text-sub">PT를 끝낼까요? 회원 페이지는 오늘부터 6개월 동안 기록을 볼 수만 있어요. 다시 등록하면 그대로 이어져요.</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => endPt(r.user_id)} disabled={busy === r.user_id}>{busy === r.user_id ? "처리 중…" : "PT 종료"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setAsking(null)} disabled={busy === r.user_id}>취소</Button>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 flex gap-2">
                <Button variant="solid" size="sm" onClick={() => setAsking(r.user_id)} disabled={Boolean(busy)}>PT 종료</Button>
                <Button variant="ghost" size="sm" onClick={() => snooze(r.user_id)} disabled={Boolean(busy)}>{busy === r.user_id ? "저장 중…" : "7일 뒤 다시 알림"}</Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Toast message={toast} />
    </ToneCard>
  );
}

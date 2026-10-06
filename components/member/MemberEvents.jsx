"use client";

/* 회원 전용 페이지 '이벤트'(2026-10-06 · 홈 맨 위 · 열린 이벤트가 있을 때만) — 옛 오운완 '트레이너 포상'을 대신한다.
   한 줄 띠 → 누르면 자세히(기간 · 신청 기간 · 정원 · 설명 · 상품) + [참여하기]. ★참여 취소 없음(대표 결정 · 화면에 미리 알림).
   출석 챌린지는 참여하면 '12/20회' 진행 막대(이벤트 기간 안 오운완 · DB가 계산) · 달성하면 "트레이너에게 받으세요".
   읽기 = member_events_view(나에게 열린 것 · 끝난 지 7일까지) · 참여 = rpc join_member_event(신청 기간 · 정원 · 대상 확인). */

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Gift } from "lucide-react";
import { eventPeriodText, joinState } from "@/lib/events";
import { notifyPush } from "@/lib/pushClient";
import Modal from "@/components/ui/Modal";

const JOIN_ERR = { not_yet: "아직 신청 기간이 아니에요.", closed: "신청이 마감됐어요.", full: "정원이 다 찼어요.", not_allowed: "지금은 참여할 수 없어요.", not_found: "이벤트가 끝났어요." };
const md = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일` : "");

export default function MemberEvents({ supabase }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("member_events_view").select("*");
    if (error) { console.error("이벤트 읽기 실패", error); setRows([]); return; }
    setRows(data || []);
  }, [supabase]);
  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  if (!rows || !rows.length) return null;
  const cur = open ? rows.find((r) => r.id === open) : null;

  const join = async (ev) => {
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.rpc("join_member_event", { p_event: ev.id });
      if (error) {
        const k = Object.keys(JOIN_ERR).find((x) => (error.message || "").includes(x));
        console.error("이벤트 참여 실패", error); setMsg(k ? JOIN_ERR[k] : "참여하지 못했어요. 다시 시도해 주세요."); return;
      }
      notifyPush(supabase.auth.getSession().then(({ data: s }) => (s?.session?.access_token ? { Authorization: `Bearer ${s.session.access_token}` } : {})), "event_join", ev.id);
      await load();
    } catch { setMsg("인터넷 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  const line = (ev) => {
    if (ev.joined && ev.kind === "challenge") return ev.progress >= ev.goal_count ? (ev.rewarded_at ? "받았어요" : "달성! 🎉") : `참여 중 · ${ev.progress}/${ev.goal_count}회`;
    if (ev.joined) return ev.rewarded_at ? "받았어요" : "참여 중";
    const js = joinState(ev);
    return js === "open" ? "참여하기" : js === "not_yet" ? `${md(ev.join_from || ev.starts_on)}부터 신청` : js === "full" ? "정원 마감" : "신청 마감";
  };

  return (
    <div className="mb-6 space-y-2">
      {rows.slice(0, 3).map((ev) => {
        const l = line(ev);
        const cta = l === "참여하기";
        return (
          <button key={ev.id} type="button" onClick={() => { setOpen(ev.id); setMsg(""); }}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-line border-l-[3px] border-l-primary bg-card px-4 py-2.5 text-left shadow-sm transition active:scale-[0.99]">
            <Gift className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-ink">{ev.title}</span>
              {ev.reward_text && <span className="block truncate text-[13px] text-sub">{ev.reward_text}</span>}
            </span>
            <span className={`shrink-0 text-[13px] font-semibold ${cta ? "rounded-full bg-primary px-3 py-1 text-white" : "text-primary-strong"}`}>{l}</span>
            {!cta && <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
          </button>
        );
      })}

      {cur && (
        <Modal variant="sheet" onClose={() => setOpen(null)} title={cur.title} subtitle={eventPeriodText(cur) === "상시" ? "상시 이벤트" : `기간 ${eventPeriodText(cur)}`}>
          {cur.reward_text && <p className="m-0 rounded-xl bg-primary-soft px-3.5 py-2.5 text-[15px] font-semibold text-primary-strong">🎁 {cur.reward_text}</p>}
          {cur.kind === "challenge" && <p className="m-0 mt-3 text-[15px] text-ink">기간 안에 <b>오운완 {cur.goal_count}회</b>를 채우면 달성이에요.</p>}
          {cur.body && <p className="m-0 mt-3 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink">{cur.body}</p>}
          <p className="m-0 mt-3 text-[13px] text-sub">
            {cur.capacity ? `정원 ${cur.capacity}명 · 지금 ${cur.joined_count}명 참여` : `지금 ${cur.joined_count}명 참여`}
            {(cur.join_from || cur.join_until) && ` · 신청 ${md(cur.join_from) || "지금"}~${md(cur.join_until) || ""}`}
          </p>

          {cur.joined ? (
            <div className="mt-4 rounded-xl bg-elevate p-3.5">
              {cur.kind === "challenge" ? (
                <>
                  <div className="flex items-baseline justify-between"><span className="text-[14px] font-semibold text-ink">참여 중</span><span className="text-[14px] font-bold text-ink">{cur.progress}/{cur.goal_count}회</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round(((cur.progress || 0) / cur.goal_count) * 100))}%` }} /></div>
                  {cur.progress >= cur.goal_count && <p className="m-0 mt-2 text-[14px] font-bold text-primary-strong">{cur.rewarded_at ? "상품을 받았어요" : "달성! 트레이너에게 받으세요 🎉"}</p>}
                </>
              ) : <p className="m-0 text-[14px] font-semibold text-ink">{cur.rewarded_at ? "혜택을 받았어요" : "참여했어요. 트레이너가 안내해 드릴 거예요."}</p>}
            </div>
          ) : joinState(cur) === "open" ? (
            <>
              <button type="button" disabled={busy} onClick={() => join(cur)} className="mt-4 min-h-[52px] w-full rounded-xl bg-primary text-[16px] font-bold text-white disabled:opacity-40">
                {busy ? "참여하는 중…" : "참여하기"}
              </button>
              <p className="m-0 mt-2 text-center text-[13px] text-muted">참여하면 취소할 수 없어요.</p>
            </>
          ) : (
            <p className="m-0 mt-4 rounded-xl bg-elevate px-3.5 py-3 text-[14px] text-sub">{line(cur)}</p>
          )}
          {msg && <p className="m-0 mt-3 text-[14px] text-danger-text">{msg}</p>}
        </Modal>
      )}
    </div>
  );
}

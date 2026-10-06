"use client";

/* =========================================================================
   회원 이벤트 관리(2026-10-06 · 옛 '포상'을 흡수) — 트레이너 설정 '이벤트' 탭 · 대표 운영 탭.
   · 만들기: 종류(출석 챌린지 = 기간 안 오운완 N회 / 일반 이벤트) · 제목 · 설명 · 상품 · 이벤트 기간 · 신청 기간 · 정원 ·
             대상(트레이너 = 내 회원 / 대표 = 센터 전체 또는 특정 트레이너 회원) · 만들 때 회원 폰 알림(선택).
   · 목록: 진행 중 · 예정 · 끝남 · 참여 N명 → 펼치면 참여 명단(진행 · 달성 · 지급 완료 체크 · rpc event_participants · set_event_reward).
   · 회원은 참여 취소가 없다(대표 결정). 이벤트 끝내기 = active false(회원 화면에서 사라짐 · 기록은 남음).
   표 member_event(RLS: 본인 것 · 대표는 센터 전체) · 옛 trainer_reward는 SQL이 '상시 출석 챌린지'로 옮겼다.
   ========================================================================= */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Gift, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { notifyPush } from "@/lib/pushClient";
import { personName } from "@/lib/format";
import { eventStatus, eventPeriodText, EVENT_STATUS_LABEL } from "@/lib/events";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

const inputCls = "w-full rounded-lg border border-line bg-elevate px-3 py-2.5 text-[15px] text-ink placeholder-muted outline-none focus:border-primary";
const EMPTY = { kind: "challenge", title: "", body: "", goal_count: "", reward_text: "", starts_on: "", ends_on: "", join_from: "", join_until: "", capacity: "", scope: "trainer", target_trainer: "", push: true };

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13.5px] font-semibold text-sub">{label}{hint && <span className="font-normal text-muted"> · {hint}</span>}</span>
      {children}
    </label>
  );
}

function Participants({ event, showToast }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("event_participants", { p_event: event.id });
    if (error) { console.error("참여 명단 읽기 실패", error); setRows([]); return; }
    setRows(data || []);
  }, [event.id]);
  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);
  const toggle = async (r) => {
    const { error } = await supabase.rpc("set_event_reward", { p_event: event.id, p_member: r.member_id, p_done: !r.rewarded_at });
    if (error) { console.error("지급 저장 실패", error); showToast("저장하지 못했어요. 다시 시도해 주세요."); return; }
    await load();
  };
  if (rows === null) return <p className="m-0 mt-2 text-[13px] text-muted">불러오는 중이에요</p>;
  if (!rows.length) return <p className="m-0 mt-2 text-[13px] text-muted">아직 참여한 회원이 없어요.</p>;
  return (
    <ul className="m-0 mt-2 list-none divide-y divide-line rounded-lg border border-line p-0">
      {rows.map((r) => {
        const hit = event.kind === "challenge" && r.progress >= event.goal_count;
        return (
          <li key={r.member_id} className="flex items-center gap-2 px-3 py-2 text-[14px]">
            <span className="min-w-0 flex-1">
              <b className="font-semibold text-ink">{r.name}</b>
              <span className="ml-1.5 text-[12.5px] text-sub">
                {new Date(r.joined_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 참여
                {event.kind === "challenge" && <> · {r.progress}/{event.goal_count}회{hit && <b className="ml-1 text-primary-strong">달성</b>}</>}
              </span>
            </span>
            {(hit || event.kind === "general") && (
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[13px] text-sub">
                <input type="checkbox" checked={Boolean(r.rewarded_at)} onChange={() => toggle(r)} className="h-4 w-4 accent-primary" /> 지급 완료
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function EventManager({ trainers = null }) {
  const { toast, showToast } = useToast();
  const [me, setMe] = useState(null);   // { id, owner }
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);   // null = 닫힘 · {..., id?}
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tlist, setTlist] = useState(trainers || []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("member_event").select("*").order("created_at", { ascending: false });
    if (error) { console.error("이벤트 읽기 실패", error); setList([]); return; }
    setList(data || []);
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { setList([]); return; }
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      const { data: t } = await supabase.from("trainer").select("role").eq("id", uid).maybeSingle();
      const owner = t?.role === "owner";
      if (owner && !trainers) {
        const { data: ts } = await supabase.from("trainer").select("id, name, role, active");
        if (alive) setTlist((ts || []).filter((x) => x.active !== false));
      }
      if (alive) setMe({ id: uid, owner });
      if (alive) await load();
    })();
    return () => { alive = false; };
  }, [load, trainers]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const startNew = () => setForm({ ...EMPTY, target_trainer: me?.id || "" });
  const startEdit = (ev) => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v ?? ""])), push: false });

  const save = async () => {
    const f = form;
    if (!f.title.trim()) { showToast("제목을 입력해 주세요"); return; }
    if (f.kind === "challenge" && !(Number(f.goal_count) >= 1)) { showToast("몇 회 달성인지 입력해 주세요"); return; }
    if (f.ends_on && f.starts_on && f.ends_on < f.starts_on) { showToast("이벤트 끝나는 날을 확인해 주세요"); return; }
    if (f.join_until && f.join_from && f.join_until < f.join_from) { showToast("신청 기간을 확인해 주세요"); return; }
    const scope = me?.owner ? f.scope : "trainer";
    const row = {
      kind: f.kind, title: f.title.trim().slice(0, 40), body: f.body.trim().slice(0, 500) || null,
      goal_count: f.kind === "challenge" ? Number(f.goal_count) : null, reward_text: f.reward_text.trim().slice(0, 60) || null,
      starts_on: f.starts_on || null, ends_on: f.ends_on || null, join_from: f.join_from || null, join_until: f.join_until || null,
      capacity: Number(f.capacity) >= 1 ? Number(f.capacity) : null,
      scope, target_trainer: scope === "trainer" ? (me?.owner ? f.target_trainer || me.id : me.id) : null,
    };
    setBusy(true);
    try {
      const q = f.id ? supabase.from("member_event").update(row).eq("id", f.id).select("id") : supabase.from("member_event").insert(row).select("id");
      const { data, error } = await q;
      if (error || !data?.length) { console.error("이벤트 저장 실패", error); showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
      if (!f.id && f.push) notifyPush(authHeader(), "event_new", data[0].id);   // 대상 회원 폰으로
      showToast(f.id ? "이벤트를 고쳤어요" : "이벤트를 열었어요");
      setForm(null); await load();
    } finally { setBusy(false); }
  };
  const setActive = async (ev, active) => {
    if (!active && !window.confirm(`'${ev.title}' 이벤트를 끝낼까요? 회원 화면에서 사라져요(참여 기록은 남아요).`)) return;
    const { data, error } = await supabase.from("member_event").update({ active }).eq("id", ev.id).select("id");
    if (error || !data?.length) { showToast("저장하지 못했어요. 다시 시도해 주세요."); return; }
    await load();
  };

  const tName = (id) => personName(tlist.find((t) => t.id === id)?.name) || "";
  const groups = list ? [
    ["진행 중 · 예정", list.filter((e) => e.active && eventStatus(e) !== "ended")],
    ["끝난 이벤트", list.filter((e) => !e.active || eventStatus(e) === "ended")],
  ] : [];

  return (
    <div className="space-y-6 lg:max-w-3xl">
      <Card>
        <SectionTitle icon={Gift} aside={list ? `${list.length}개` : null}>회원 이벤트</SectionTitle>
        <p className="m-0 mb-3 text-[13.5px] leading-relaxed text-sub">
          회원 전용 페이지 홈 맨 위에 떠요. 회원이 <b className="font-semibold text-ink">참여하기</b>를 누르면 여기 명단에 들어와요(참여 취소는 없어요).
          출석 챌린지는 기간 안 오운완 수로 진행이 자동으로 채워져요.
        </p>
        {!form && <button type="button" onClick={startNew} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-bold text-white"><Plus className="h-4 w-4" /> 이벤트 만들기</button>}

        {form && (
          <div className="space-y-3 rounded-xl border border-line p-3.5">
            <div className="flex gap-1 rounded-full bg-elevate p-[3px]">
              {[["challenge", "출석 챌린지"], ["general", "일반 이벤트"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => set("kind")(k)} aria-pressed={form.kind === k}
                  className={`min-h-[40px] flex-1 rounded-full text-[14px] ${form.kind === k ? "bg-card font-semibold text-ink shadow-sm" : "text-sub"}`}>{l}</button>
              ))}
            </div>
            <Field label="제목"><input value={form.title} onChange={set("title")} maxLength={40} placeholder={form.kind === "challenge" ? "예: 10월 오운완 챌린지" : "예: 바디프로필 촬영 이벤트"} className={inputCls} /></Field>
            {form.kind === "challenge" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="목표" hint="오운완 횟수"><input value={form.goal_count} onChange={(e) => set("goal_count")(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} inputMode="numeric" placeholder="20" className={inputCls} /></Field>
                <Field label="상품" hint="선택"><input value={form.reward_text} onChange={set("reward_text")} maxLength={60} placeholder="단백질 쉐이크" className={inputCls} /></Field>
              </div>
            )}
            {form.kind === "general" && <Field label="혜택" hint="선택"><input value={form.reward_text} onChange={set("reward_text")} maxLength={60} placeholder="예: 촬영 비용 50% 지원" className={inputCls} /></Field>}
            <Field label="설명" hint="선택"><textarea value={form.body} onChange={set("body")} maxLength={500} rows={3} placeholder="참여 방법 · 주의할 점" className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="이벤트 시작" hint="비우면 바로"><input type="date" value={form.starts_on} onChange={set("starts_on")} className={inputCls} /></Field>
              <Field label="이벤트 끝" hint="비우면 상시"><input type="date" value={form.ends_on} onChange={set("ends_on")} className={inputCls} /></Field>
              <Field label="신청 시작" hint="비우면 이벤트 시작"><input type="date" value={form.join_from} onChange={set("join_from")} className={inputCls} /></Field>
              <Field label="신청 마감" hint="비우면 이벤트 끝"><input type="date" value={form.join_until} onChange={set("join_until")} className={inputCls} /></Field>
            </div>
            <Field label="정원" hint="선택 · 선착순"><input value={form.capacity} onChange={(e) => set("capacity")(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} inputMode="numeric" placeholder="제한 없음" className={inputCls} /></Field>
            {me?.owner && (
              <Field label="대상">
                <select value={form.scope === "center" ? "center" : form.target_trainer} onChange={(e) => setForm((f) => (e.target.value === "center" ? { ...f, scope: "center" } : { ...f, scope: "trainer", target_trainer: e.target.value }))} className={inputCls}>
                  <option value="center">센터 전체 회원</option>
                  {tlist.map((t) => <option key={t.id} value={t.id}>{personName(t.name)} 트레이너 회원</option>)}
                </select>
              </Field>
            )}
            {!form.id && (
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-[14px] text-ink">
                <input type="checkbox" checked={form.push} onChange={set("push")} className="h-4 w-4 accent-primary" /> 대상 회원 폰으로 알림 보내기(알림 켠 회원만)
              </label>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="min-h-[44px] rounded-xl border border-line bg-card px-4 text-[14px] font-semibold text-sub">취소</button>
              <button type="button" disabled={busy} onClick={save} className="min-h-[44px] flex-1 rounded-xl bg-primary text-[15px] font-bold text-white disabled:opacity-40">{form.id ? "저장" : "이벤트 열기"}</button>
            </div>
          </div>
        )}
      </Card>

      {groups.map(([label, evs]) => evs.length > 0 && (
        <Card key={label}>
          <SectionTitle icon={Gift}>{label}</SectionTitle>
          <ul className="m-0 list-none space-y-2 p-0">
            {evs.map((ev) => {
              const st = eventStatus(ev);
              const mine = me?.owner || ev.created_by === me?.id;
              return (
                <li key={ev.id} className="rounded-xl bg-elevate px-3.5 py-3">
                  <button type="button" onClick={() => setOpenId(openId === ev.id ? null : ev.id)} className="flex w-full items-start gap-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{ev.title}</span>
                      <span className="block text-[13px] text-sub">
                        {!ev.active ? "끝냄" : EVENT_STATUS_LABEL[st]} · {ev.kind === "challenge" ? `오운완 ${ev.goal_count}회` : "일반"}{ev.reward_text ? ` · ${ev.reward_text}` : ""}
                      </span>
                      <span className="block text-[12.5px] text-muted">{eventPeriodText(ev)}{ev.scope === "center" ? " · 센터 전체" : me?.owner ? ` · ${tName(ev.target_trainer)} 회원` : ""}{ev.capacity ? ` · 정원 ${ev.capacity}명` : ""}</span>
                    </span>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${openId === ev.id ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {openId === ev.id && (
                    <>
                      <Participants event={ev} showToast={showToast} />
                      {mine && (
                        <div className="mt-2 flex gap-3 text-[13px] font-semibold">
                          <button type="button" onClick={() => startEdit(ev)} className="min-h-[36px] text-sub">고치기</button>
                          {ev.active ? <button type="button" onClick={() => setActive(ev, false)} className="min-h-[36px] text-danger-text">이벤트 끝내기</button>
                            : <button type="button" onClick={() => setActive(ev, true)} className="min-h-[36px] text-sub">다시 열기</button>}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      <Toast message={toast} />
    </div>
  );
}

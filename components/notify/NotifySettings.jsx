"use client";

/* 트레이너 설정 '알림'(2026-10-06) — ① 이 폰에서 알림 받기(켜기 · 끄기 · 시험 알림) ② 받을 알림 종류 켜기 · 끄기.
   종류 설정은 계정에 저장(notify_pref · 다른 폰에도 같이) · 폰 켜기는 기기마다(이 폰만).
   아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어 그 안내를 먼저 보여 준다. */

import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { NOTIFY_TYPES } from "@/lib/notifyTypes";

const SOLO_HIDDEN = new Set(["owner_feedback", "payroll", "ot_pending", "owner_report"]);
import { pushState, enablePush, disablePush, notifyPush } from "@/lib/pushClient";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";

function Toggle({ on, onChange, label, hint, disabled }) {
  return (
    <label className={`flex min-h-[56px] cursor-pointer items-center justify-between gap-3 py-2.5 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-sub">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-line transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
        <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function NotifySettings() {
  const { toast, showToast } = useToast();
  const [state, setState] = useState(null);   // on | off | denied | unsupported | ios_install | null(확인 중)
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState(null);         // { id, owner, solo }
  const [prefs, setPrefs] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await pushState();
      if (alive) setState(s);
      if (!supabase) return;
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id;
      if (!uid) return;
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("trainer").select("role, account:account_id(type)").eq("id", uid).maybeSingle(),
        supabase.from("notify_pref").select("prefs").eq("trainer_id", uid).maybeSingle(),
      ]);
      if (alive) { setMe({ id: uid, owner: t?.role === "owner", solo: t?.account?.type === "solo" }); setPrefs(p?.prefs || {}); }
    })();
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    const s = await enablePush(await authHeader());
    setState(s === "error" ? "off" : s);
    setBusy(false);
    if (s === "on") { showToast("이 폰에서 알림을 받아요"); notifyPush(authHeader(), "test", ""); }
    else if (s === "denied") showToast("알림이 막혀 있어요. 폰 설정에서 알림을 허용해 주세요.");
    else if (s === "error") showToast("알림을 켜지 못했어요. 다시 시도해 주세요.");
  };
  const turnOff = async () => {
    setBusy(true);
    const s = await disablePush(await authHeader());
    setState(s === "error" ? "on" : "off");
    setBusy(false);
    if (s === "off") showToast("이 폰에서 알림을 껐어요");
  };
  const setPref = async (key, on) => {
    if (!me) return;
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    const { data, error } = await supabase.from("notify_pref").upsert({ trainer_id: me.id, prefs: next, updated_at: new Date().toISOString() }).select("trainer_id");
    if (error || !data?.length) { console.error("알림 설정 저장 실패", error); setPrefs(prefs); showToast("저장하지 못했어요. 다시 시도해 주세요."); }
  };

  // 개인 계정엔 대표 · 센터에서만 생기는 알림이 없다(대표 피드백 · 급여 확정 · 배정 대기 · 아침 보고서 · 2026-10-06).
  const types = NOTIFY_TYPES
    .filter((t) => (me?.solo ? !SOLO_HIDDEN.has(t.key) : t.who === "trainer" || (t.who === "owner" && me?.owner)))
    .map((t) => (me?.solo && t.key === "ot_new" ? { ...t, hint: "내 QR로 신청했을 때" } : t));

  return (
    <div className="space-y-6 lg:max-w-2xl">
      <Card>
        <SectionTitle icon={Smartphone}>이 폰에서 알림 받기</SectionTitle>
        {state === null ? <p className="m-0 text-[14px] text-muted">확인하는 중이에요</p>
          : state === "ios_install" ? (
            <div className="text-[14px] leading-relaxed text-ink">
              <p className="m-0 font-semibold">아이폰은 앱을 홈 화면에 추가해야 알림을 받을 수 있어요.</p>
              <ol className="m-0 mt-2 list-decimal space-y-1 pl-5 text-sub">
                <li>사파리 아래 <b className="text-ink">공유 버튼(네모에 위 화살표)</b>을 눌러요</li>
                <li><b className="text-ink">홈 화면에 추가</b>를 눌러요</li>
                <li>홈 화면에 생긴 <b className="text-ink">오직 트레이너</b> 아이콘으로 열고, 여기서 알림을 켜요</li>
              </ol>
            </div>
          ) : state === "unsupported" ? (
            <p className="m-0 text-[14px] text-sub">이 브라우저는 알림을 받을 수 없어요. 폰의 크롬(안드로이드)이나 홈 화면에 추가한 앱(아이폰)에서 켜 주세요.</p>
          ) : state === "denied" ? (
            <p className="m-0 text-[14px] leading-relaxed text-sub">알림이 막혀 있어요. 폰 <b className="text-ink">설정 → 알림 → 오직 트레이너</b>(또는 브라우저 사이트 설정)에서 허용한 뒤 다시 열어 주세요.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-[15px] font-semibold ${state === "on" ? "text-primary-strong" : "text-sub"}`}>
                {state === "on" ? <Bell className="h-4 w-4" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
                {state === "on" ? "켜져 있어요" : "꺼져 있어요"}
              </span>
              <span className="ml-auto flex gap-2">
                {state === "on" && (
                  <button type="button" onClick={() => { notifyPush(authHeader(), "test", ""); showToast("시험 알림을 보냈어요"); }}
                    className="min-h-[44px] rounded-xl border border-line bg-card px-3.5 text-[14px] font-semibold text-ink">시험 알림</button>
                )}
                <button type="button" disabled={busy} onClick={state === "on" ? turnOff : turnOn}
                  className={`min-h-[44px] rounded-xl px-4 text-[14px] font-bold disabled:opacity-40 ${state === "on" ? "border border-line bg-card text-sub" : "bg-primary text-white"}`}>
                  {state === "on" ? "끄기" : "알림 켜기"}
                </button>
              </span>
            </div>
          )}
      </Card>

      <Card>
        <SectionTitle icon={Bell}>받을 알림</SectionTitle>
        <p className="m-0 mb-1 text-[13.5px] text-sub">끈 알림은 폰으로 오지 않아요. 앱 안의 카드는 그대로 보여요.</p>
        <div className="divide-y divide-line">
          {types.map((t) => (
            <Toggle key={t.key} label={t.label} hint={t.hint} on={prefs[t.key] !== false} disabled={!me} onChange={(v) => setPref(t.key, v)} />
          ))}
        </div>
      </Card>
      <Toast message={toast} />
    </div>
  );
}

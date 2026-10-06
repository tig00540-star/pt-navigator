// app/api/ot-intake/route.js — OT 신청서(QR · 링크) 공개 라우트(2026-10-06).
//   로그인 없는 회원이 쓰는 페이지라 DB를 직접 열지 않는다(anon 정책 없음). 여기서 입력을 다듬고
//   service_role로 함수(intake_link_info · submit_ot_application)만 부른다 — 코드 확인 · 장난 신청 제한 · 저장은 DB 함수 안.
//   GET  ?code=…  → { ok, center, trainer, kind } | { error: 'invalid' | 'closed' }
//   POST  { code, name, phone, answers, slots, consent, website(빈칸이어야 함) } → { ok, kind, app, token } | { error }   (1단계)
//   PATCH { app, token, answers, health } → { ok, health } | { error }   (2단계 이어 적기 · 질문 하나 누를 때마다 · 24시간)
import { createClient } from "@supabase/supabase-js";
import { CONSENT_VERSION } from "@/lib/consent";
import { WEEKLY_OPTS, LEAD_SOURCES, HEALTH_SCREEN_ITEMS, TRAINER_GENDER_OPTS } from "@/lib/memberOptions";
import { formatSlots, slotDays } from "@/lib/slots";
import { after } from "next/server";
import { sendPush, ownerIds } from "@/lib/pushServer";

export const runtime = "nodejs";

const CODE_RE = /^[0-9a-f]{16}$/;
// 사전 문진에서 받는 칸만(나머지는 버림) · 글자 수 제한.
const TEXT_KEYS = ["gender", "job", "residence", "goal", "goal_deadline", "training_pace", "exercise_level",
  "quit_reason", "past_exercise", "activity_level", "member_note"];
const HEALTH_KEYS = ["pain", "injury_history"];

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 회원이 보낸 답 → 받는 칸만 · 정해진 값만 · 글자 수 제한(1단계 · 2단계 공용). 건강정보는 health일 때만.
function cleanAnswers(a = {}, health = false) {
  const out = {};
  for (const k of TEXT_KEYS) { if (!(k in a)) continue; const v = clip(a[k], k === "member_note" ? 300 : 60); out[k] = v; }
  if (out.gender && !["female", "male"].includes(out.gender)) delete out.gender;
  if ("age" in a) { const age = String(a.age ?? "").replace(/[^0-9]/g, ""); if (age && Number(age) >= 10 && Number(age) <= 99) out.age = age; }
  if ("weekly_freq" in a && WEEKLY_OPTS.some(([v]) => v === a.weekly_freq)) out.weekly_freq = a.weekly_freq;
  if ("lead_source" in a && LEAD_SOURCES.includes(a.lead_source)) out.lead_source = a.lead_source;
  if ("pref_trainer_gender" in a && TRAINER_GENDER_OPTS.some(([v]) => v === a.pref_trainer_gender)) out.pref_trainer_gender = a.pref_trainer_gender;
  if (health) {
    for (const k of HEALTH_KEYS) if (k in a) out[k] = clip(a[k], 120);
    const h = a.health_screen;
    if (h && typeof h === "object") {
      out.health_screen = h.none ? { none: true }
        : { items: (Array.isArray(h.items) ? h.items : []).filter((x) => HEALTH_SCREEN_ITEMS.includes(x)), ...(clip(h.note, 120) ? { note: clip(h.note, 120) } : {}) };
    }
  }
  return out;
}

export async function GET(req) {
  const sb = client();
  if (!sb) return Response.json({ error: "closed" }, { status: 503 });
  const code = new URL(req.url).searchParams.get("code") || "";
  if (!CODE_RE.test(code)) return Response.json({ error: "invalid" }, { status: 404 });
  const { data, error } = await sb.rpc("intake_link_info", { p_code: code });
  if (error) { console.error("[ot-intake] info 실패", error.message); return Response.json({ error: "closed" }, { status: 500 }); }
  return Response.json(data || { error: "invalid" }, { status: data?.ok ? 200 : 404 });
}

export async function POST(req) {
  const sb = client();
  if (!sb) return Response.json({ error: "closed" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  if (b.website) return Response.json({ ok: true });   // 사람 눈엔 안 보이는 칸 — 채워져 있으면 자동 제출(봇)
  const code = String(b.code || "");
  if (!CODE_RE.test(code)) return Response.json({ error: "invalid" }, { status: 404 });

  const name = clip(b.name, 40);
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (!name) return Response.json({ error: "name" }, { status: 400 });
  if (!/^01[0-9]{8,9}$/.test(phone)) return Response.json({ error: "phone" }, { status: 400 });
  const c = b.consent || {};
  if (!c.general || !c.log_rule) return Response.json({ error: "consent" }, { status: 400 });
  const health = Boolean(c.health);

  const answers = cleanAnswers(b.answers || {}, health);

  // 원하는 요일 · 시간 v2 — 요일마다 시간({by_day}) · 옛 {days, hours}도 받는다(lib/slots가 같은 규칙으로 읽음).
  const s = b.slots || {};
  const note = clip(s.note, 100);
  const by_day = {};
  for (const [d, hs] of slotDays(s)) by_day[d] = hs.filter((h) => h >= 5 && h <= 23);
  const days = Object.keys(by_day).map(Number);
  const hours = [...new Set(Object.values(by_day).flat())].sort((x, y) => x - y);   // 옛 형식 읽는 곳(SQL 대체 글)용 합집합
  const base = { by_day, days, hours, ...(note ? { note } : {}) };
  const slots = days.length || note ? { ...base, text: formatSlots({ by_day, note }) } : null;

  const consent = { general: true, log_rule: true, health, version: CONSENT_VERSION, at: new Date().toISOString() };
  const { data, error } = await sb.rpc("submit_ot_application", {
    p_code: code, p_name: name, p_phone: phone, p_answers: answers, p_slots: slots, p_consent: consent,
  });
  if (error) { console.error("[ot-intake] 제출 실패", error.message); return Response.json({ error: "server" }, { status: 500 }); }
  if (data?.error) return Response.json(data, { status: data.error === "busy" ? 429 : 404 });
  // 폰 알림(응답 뒤 · 실패해도 신청은 저장됨): 트레이너 QR → 그 트레이너 '새 OT 회원' · 센터 QR → 대표 '배정 대기'
  if (!data?.repeat) after(async () => {
    try {
      const { data: l } = await sb.from("intake_link").select("id, account_id, trainer_id").eq("code", code).eq("active", true).maybeSingle();
      if (!l) return;
      const when = slots?.text ? ` · 원하는 시간 ${slots.text}` : "";
      if (l.trainer_id) {
        const { data: m } = await sb.from("ot_application").select("member_id").eq("link_id", l.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        await sendPush(sb, { trainerIds: [l.trainer_id], type: "ot_new", title: "새 OT 회원이 신청했어요", body: `${name} 님${when}`, url: m?.member_id ? `/ot/${m.member_id}` : "/today" });
      } else {
        await sendPush(sb, { trainerIds: await ownerIds(sb, l.account_id), type: "ot_pending", title: "OT 신청이 들어왔어요", body: `${name} 님 · 담당 트레이너를 정해 주세요${when}`, url: "/admin" });
      }
    } catch (e) { console.error("[ot-intake] 알림 실패", e?.message || e); }
  });
  return Response.json({ ok: true, kind: data?.kind || null, app: data?.app || null, token: data?.token || null });
}

// 2단계 이어 적기 — 질문 하나 누를 때마다 부른다(열쇠 · 24시간은 DB 함수가 확인).
export async function PATCH(req) {
  const sb = client();
  if (!sb) return Response.json({ error: "closed" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const app = String(b.app || ""), token = String(b.token || "");
  if (!UUID_RE.test(app) || !/^[0-9a-f]{32}$/.test(token)) return Response.json({ error: "invalid" }, { status: 404 });
  const health = Boolean(b.health);
  const { data, error } = await sb.rpc("update_ot_application", {
    p_app: app, p_token: token, p_answers: cleanAnswers(b.answers || {}, health || Boolean(b.healthKnown)), p_health: health,
  });
  if (error) { console.error("[ot-intake] 이어 적기 실패", error.message); return Response.json({ error: "server" }, { status: 500 }); }
  if (data?.error) return Response.json(data, { status: 404 });
  return Response.json({ ok: true, health: Boolean(data?.health) });
}

// app/api/ot-intake/route.js — OT 신청서(QR · 링크) 공개 라우트(2026-10-06).
//   로그인 없는 회원이 쓰는 페이지라 DB를 직접 열지 않는다(anon 정책 없음). 여기서 입력을 다듬고
//   service_role로 함수(intake_link_info · submit_ot_application)만 부른다 — 코드 확인 · 장난 신청 제한 · 저장은 DB 함수 안.
//   GET  ?code=…  → { ok, center, trainer, kind } | { error: 'invalid' | 'closed' }
//   POST { code, name, phone, answers, slots, consent, website(빈칸이어야 함) } → { ok } | { error }
import { createClient } from "@supabase/supabase-js";
import { CONSENT_VERSION } from "@/lib/consent";
import { formatSlots } from "@/lib/slots";
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

  const a = b.answers || {};
  const answers = {};
  for (const k of TEXT_KEYS) { const v = clip(a[k], k === "member_note" ? 300 : 60); if (v) answers[k] = v; }
  if (answers.gender && !["female", "male"].includes(answers.gender)) delete answers.gender;
  const age = String(a.age ?? "").replace(/[^0-9]/g, "");
  if (age && Number(age) >= 10 && Number(age) <= 99) answers.age = age;
  if (health) for (const k of HEALTH_KEYS) { const v = clip(a[k], 120); if (v) answers[k] = v; }   // 건강정보는 동의했을 때만 받는다

  const s = b.slots || {};
  const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => d >= 1 && d <= 7))].sort((x, y) => x - y);
  const hours = [...new Set((Array.isArray(s.hours) ? s.hours : []).map(Number).filter((h) => h >= 5 && h <= 23))].sort((x, y) => x - y);
  const note = clip(s.note, 100);
  const base = { days, hours, ...(note ? { note } : {}) };
  const slots = days.length || hours.length || note ? { ...base, text: formatSlots(base) } : null;

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
  return Response.json({ ok: true, kind: data?.kind || null });
}

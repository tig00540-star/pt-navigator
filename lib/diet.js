/* =========================================================================
   식단 관리(2026-10-11 · 1단계) — 숫자 규칙 한 곳(클라 · 서버 · AI 프롬프트 공용 · DB 호출 없음).
   하루 = 오전 6시 ~ 다음 날 오전 6시(KST · DB diet_today()와 같은 규칙).
   목표량: 인바디 기초대사량(없으면 체지방률로 제지방 추정) × 활동 1.35 = 유지 열량 → 목적별 조절.
     다이어트 · 바디프로필 = 유지 − (목표 kg × 7,700 ÷ 일수) · 단 기초대사량 아래로 안 내림 · 한 주 1% 넘는 감량은 '빠듯해요'
     벌크업 = 유지 + 250 · 건강관리 = 유지 · 대회 준비 = 트레이너가 직접(manual)
   운동하는 날 = +150kcal. 탄단지: 단백질 체중 × 1.4~2.0g · 지방 25% · 나머지 탄수화물.
   질환이 적힌 회원(당뇨 · 신장 등) = 숫자 없이 기록 관리만(no_numbers).
   ========================================================================= */

export const DIET_PURPOSES = [
  { key: "diet", label: "다이어트" },
  { key: "bulk", label: "벌크업" },
  { key: "bodyprofile", label: "바디프로필" },
  { key: "contest", label: "대회 준비" },
  { key: "health", label: "건강관리" },
];
export const purposeLabel = (k) => DIET_PURPOSES.find((p) => p.key === k)?.label || "";
export const DIET_MONTHS = [1, 2, 3, 4, 6];
export const DIET_SITUATIONS = ["회식 있음", "편의점 위주", "도시락", "외식", "못 먹는 음식 있음"];
export const DIET_REQUESTS_PER_DAY = 3;
export const DIET_AUTO_AFTER_MIN = 60;          // 1 · 2번째 요청 = 1시간 안에 답이 없으면 AI
export const DIET_AUTO_SEQ = 2;                 // 3번째는 트레이너가 직접

const KST = 9 * 3600000;
const SIX = 6 * 3600000;
// 'YYYY-MM-DD' — 그 시각이 속한 식단 하루
export const dietDayOf = (at = Date.now()) => new Date(new Date(at).getTime() + KST - SIX).toISOString().slice(0, 10);
export const dietToday = () => dietDayOf(Date.now());
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// "10월 11일(토)"
export const dayLabel = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${"일월화수목금토"[d.getUTCDay()]})`; };
// "오후 7:30"(KST)
export const timeLabel = (iso) => { const d = new Date(new Date(iso).getTime() + KST); const h = d.getUTCHours(); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const kstHour = (iso) => { const d = new Date(new Date(iso).getTime() + KST); return d.getUTCHours() + d.getUTCMinutes() / 60; };

// 질환이 적혀 있으면 숫자 대신 기록 관리만(의료 영역 · 트레이너 화면에 이유를 보여 줌)
const DISEASE_RE = /당뇨|신장|콩팥|투석|고혈압|갑상선|통풍|간염|간 ?질환|임신|수유|섭식|거식|폭식증|암 ?치료|심장/;
export function diseaseOf(member) {
  const hs = member?.health_screen;
  const text = [member?.pain, member?.injury_history, member?.member_note, hs && typeof hs === "object" ? [...(hs.items || []), hs.note].join(" ") : hs].filter(Boolean).join(" ");
  const m = text.match(DISEASE_RE);
  return m ? m[0] : null;
}

// 목적 기본값 — 회원 목표 글에서
export function purposeFromGoal(goal) {
  const g = String(goal || "");
  if (/대회|시합|피지크|보디빌/.test(g)) return "contest";
  if (/바디 ?프로필|바프|촬영/.test(g)) return "bodyprofile";
  if (/벌크|증량|근육|근력/.test(g)) return "bulk";
  if (/다이어트|감량|체지방|뱃살|살|체중/.test(g)) return "diet";   // '체중 회복'(출산 후 등)도 감량
  return "health";
}
export const defaultGoalKg = (purpose) => (purpose === "diet" ? -4 : purpose === "bodyprofile" ? -3 : purpose === "bulk" ? 2 : null);

// 기초대사량 — 인바디 값 → 없으면 체지방률로 제지방량 → Katch-McArdle
export function bmrOf(inbody) {
  if (!inbody) return null;
  if (Number(inbody.bmr) > 0) return Math.round(Number(inbody.bmr));
  const w = Number(inbody.weight), bf = Number(inbody.body_fat_pct);
  if (w > 0 && bf > 0) return Math.round(370 + 21.6 * w * (1 - bf / 100));
  return null;
}

const r10 = (x) => Math.round(x / 10) * 10;

/**
 * 목표량 계산. 반환:
 *  { ok:false, reason } (인바디 없음) |
 *  { ok:true, kcalRest, kcalPt, carb, protein, fat, maint, bmr, weight, tight, safeMonths, perWeekKg }
 */
export function dietTargets({ purpose, months, goalKg, inbody, manual = null }) {
  if (purpose === "contest" || manual) {
    const m = manual || {};
    return { ok: Boolean(m.kcalRest), manual: true, kcalRest: m.kcalRest || null, kcalPt: m.kcalPt || m.kcalRest || null, carb: m.carb || null, protein: m.protein || null, fat: m.fat || null };
  }
  const bmr = bmrOf(inbody);
  const weight = Number(inbody?.weight) || null;
  if (!bmr || !weight) return { ok: false, reason: "inbody" };
  const maint = bmr * 1.35;
  let kcal = maint, tight = false, safeMonths = null, perWeekKg = null;
  const days = Math.max(14, (Number(months) || 3) * 30.4);
  const g = Number(goalKg) || 0;
  if ((purpose === "diet" || purpose === "bodyprofile") && g < 0) {
    const need = maint - (Math.abs(g) * 7700) / days;
    perWeekKg = Math.abs(g) / (days / 7);
    tight = need < bmr || perWeekKg > weight * 0.01;
    if (tight) {
      // 기초대사량 아래로 안 내리고 · 한 주 1% 안에서 되는 개월 수
      const byBmr = (Math.abs(g) * 7700) / Math.max(1, maint - bmr) / 30.4;
      const byRate = Math.abs(g) / (weight * 0.01) / 4.345;
      safeMonths = Math.ceil(Math.max(byBmr, byRate));
    }
    kcal = Math.max(bmr, need);
  } else if (purpose === "bulk") {
    kcal = maint + 250;
  }
  const pFactor = purpose === "bodyprofile" ? 2.0 : purpose === "diet" || purpose === "bulk" ? 1.8 : 1.4;
  const protein = Math.round(weight * pFactor);
  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { ok: true, kcalRest: r10(kcal), kcalPt: r10(kcal + 150), carb, protein, fat, maint: r10(maint), bmr, weight, tight, safeMonths, perWeekKg };
}

/**
 * 먹은 시간 사실(앱이 뽑고 AI는 말로만 · 설계 '시간 규칙').
 * meals: [{eaten_at, kcal?}] · workouts: [iso] (그날 PT · 개인운동 시각)
 */
export function timingFacts(meals = [], workouts = []) {
  const ms = [...meals].filter((m) => m.eaten_at).sort((a, b) => Date.parse(a.eaten_at) - Date.parse(b.eaten_at));
  const out = [];
  if (!ms.length) return out;
  const hours = ms.map((m) => kstHour(m.eaten_at));
  // 야식: 밤 10시 이후 ~ 새벽 6시 전(하루 경계 6시라 22~30시)
  const late = ms.filter((m) => { const h = kstHour(m.eaten_at); return h >= 22 || h < 6; });
  if (late.length) out.push({ key: "late", text: `밤 ${late.length > 1 ? "늦게 " + late.length + "번" : timeLabel(late[0].eaten_at)}에 먹었어요(야식)` });
  // 첫 끼가 늦음: 11시 이후
  const firstH = hours[0] < 6 ? hours[0] + 24 : hours[0];
  if (firstH >= 11) out.push({ key: "first_late", text: `첫 끼가 ${timeLabel(ms[0].eaten_at)}이었어요(아침 거름)` });
  // 긴 공백: 끼니 사이 6시간 넘게
  for (let i = 1; i < ms.length; i++) {
    const gap = (Date.parse(ms[i].eaten_at) - Date.parse(ms[i - 1].eaten_at)) / 3600000;
    if (gap > 6) { out.push({ key: "gap", text: `${timeLabel(ms[i - 1].eaten_at)} → ${timeLabel(ms[i].eaten_at)} 사이가 ${Math.round(gap)}시간 비었어요` }); break; }
  }
  // 몰아 먹기: 한 끼가 하루 열량의 절반 이상
  const total = ms.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const big = total > 0 ? ms.find((m) => (Number(m.kcal) || 0) >= total * 0.5 && ms.length >= 2) : null;
  if (big) out.push({ key: "binge", text: `${timeLabel(big.eaten_at)} 한 끼에 하루 양의 절반 넘게 먹었어요` });
  // 운동 전후
  for (const w of workouts) {
    const wt = Date.parse(w);
    const before = ms.find((m) => { const d = (wt - Date.parse(m.eaten_at)) / 3600000; return d > 0 && d <= 1 && (Number(m.kcal) || 0) >= 600; });
    if (before) { out.push({ key: "pre_big", text: `운동 1시간 안에 많이 먹었어요(${timeLabel(before.eaten_at)})` }); break; }
    const after = ms.find((m) => Date.parse(m.eaten_at) > wt);
    if (!after || (Date.parse(after.eaten_at) - wt) / 3600000 > 2) { out.push({ key: "post_none", text: `운동 뒤 2시간 넘게 아무것도 안 먹었어요` }); break; }
  }
  return out;
}

// 하루 목표(운동한 날이면 kcalPt)
export const dayTarget = (plan, trained) => (plan ? (trained ? plan.kcal_pt : plan.kcal_rest) : null);

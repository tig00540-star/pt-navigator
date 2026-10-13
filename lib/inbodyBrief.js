/* 2차 이상 OT 대본 · 2차 세일즈북에 붙이는 인바디 요약(2026-10-13) — 순수 함수(서버 app/api/ot-brief가 쓴다).
   새 AI 호출 없이 이미 있는 것만 재사용한다:
     · 실제 측정 = inbody_log(최신 측정 · 그 전 측정) — 사실
     · 앱 분석 = 그 회원 1차 OT 행 report.inbody_analysis — 참고 해석. 분석에 쓴 측정(meta.sourceId)이 지금 최신 측정일 때만 쓴다
       (인바디 분석 탭의 cacheFor와 같은 규칙 · 새로 쟀으면 옛 분석은 빼고 최신 숫자만).
   식단(diet) · 생활 습관(lifestyle) 제안은 넘기지 않는다 — 세일즈 문서가 식단 관리 같은 서비스를 약속하게 될 수 있어서.
   측정이 없으면 null(대본 · 세일즈북은 예전과 똑같이 만든다). */
import { INBODY_FIELDS } from "@/lib/labels";

const ibTxt = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const ibNum = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const ibDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");

// rows = 이 회원의 inbody_log(최신 먼저) · analysis = 1차 행 report.inbody_analysis({ data, meta })
export function inbodyForSales({ rows = [], analysis = null } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === "object");
  const latest = list[0];
  if (!latest || !ibDay(latest.measured_at)) return null;
  const prev = list[1] && ibDay(list[1].measured_at) ? list[1] : null;
  const values = INBODY_FIELDS.map((f) => {
    const v = ibNum(latest[f.key]);
    if (v == null) return null;
    const p = prev ? ibNum(prev[f.key]) : null;
    return { key: f.key, label: f.label, unit: f.unit, value: v, prev: p };
  }).filter(Boolean);
  if (!values.length) return null;
  const d = analysis && typeof analysis === "object" ? analysis.data : null;
  const fresh = Boolean(d && typeof d === "object" && latest.id != null && analysis.meta?.sourceId === latest.id);
  const read = fresh ? {
    headline: ibTxt(d.headline, 120),
    points: (Array.isArray(d.metrics) ? d.metrics : []).map((x) => (x && typeof x === "object" ? { label: ibTxt(x.label, 20), state: ibTxt(x.state, 120), meaning: ibTxt(x.meaning, 120) } : null))
      .filter((x) => x && x.label && (x.state || x.meaning)).slice(0, 6),
    exercise: (Array.isArray(d.exercise) ? d.exercise : []).map((x) => ibTxt(x, 120)).filter(Boolean).slice(0, 3),
    why_now: ibTxt(d.why_now, 300),
  } : null;
  return { measured_at: ibDay(latest.measured_at), prev_at: prev ? ibDay(prev.measured_at) : "", values, read: read && (read.headline || read.points.length || read.exercise.length || read.why_now) ? read : null };
}

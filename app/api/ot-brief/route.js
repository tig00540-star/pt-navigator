// app/api/ot-brief/route.js
// -----------------------------------------------------------------------------
// OT · 재등록 AI 지원 (서버 전용). 대본은 서버가 저장까지 한다(save) · 2차+ · 재등록은 저장 뒤 세일즈북을 이어 만든다(follow).
//   대본(Opus): "first" 1차 OT · "second" 2차+ OT · "reregister" 재등록 — 30초 요약 · 입장 · 운동 · 클로징 · 거절 5종 · 추천 프로그램
//   회원용(Sonnet): "salesbook" · "reg_salesbook"(세일즈북) · "inbody" · "roadmap" · "posture"(화면에서 뺌) · "first_salesbook"(부르는 곳 없음)
// system = 가드레일 프리앰블(스파링 파트너/환각 금지/윤리/출력규칙, 문자 그대로).
// 키 미설정·API 실패·JSON 파싱 실패 → 명확한 상태코드 (프론트가 데모 폴백 판별).
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { tidyDeep, NO_DASH_RULE } from "@/lib/tidyText";
import { attachPkgSnapshots } from "@/lib/pkgRef";
import { OT_PURPOSE_OPTS } from "@/lib/memberOptions";
import { pkgPace, weeklyNum, WEEKS_PER_MONTH } from "@/lib/pkgPace";
import { contractPeriod } from "@/lib/regPeriod";
import { inbodyForSales } from "@/lib/inbodyBrief";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { adminClient, reserveAi, finishAi, quotaResponse, tierOf, preparedThisMonth } from "@/lib/aiQuota";

export const runtime = "nodejs";
export const maxDuration = 180; // Hobby+fluid compute 기본 300s. 실측 ~45s의 4배 마진 + 업스트림 무응답 폭주 상한(선언제거=300s는 비권장).

// 모델(2026-10-02 대표 결정): 등록이 걸린 리포트(1차·2차+ OT 준비 · 재등록 브리핑)는 Opus 5.5,
//   나머지(세일즈북·인바디·응급)는 Sonnet 5.5. 리포트는 회원·차수당 한 번 만들고 저장해 다시 쓰므로 호출이 적다.
const MODEL_REPORT = "claude-opus-5-5";
const MODEL_FAST = "claude-sonnet-5-5";
const REPORT_PHASES = new Set(["first", "second", "reregister"]);
// 모델마다 '생각(thinking)' 설정이 다르다 — Opus 5.5는 adaptive만(끄기 불가), Sonnet 5.5는 between_tools = 끔.
const thinkingFor = (model) => (model.startsWith("claude-opus") ? { type: "adaptive" } : { type: "between_tools" });

/* 결과를 서버가 직접 저장 — 트레이너가 다른 화면으로 가거나 창을 닫아도 만든 리포트가 남게(2026-10-02).
   트레이너 본인 토큰으로 쓰므로 RLS는 클라 저장과 같다(service_role 아님). report는 기존 키 보존 병합.
   save = { kind: "ot", memberId, round, meta } | { kind: "contract", contractId, meta, satisfaction } */
async function saveResult(token, phase, save, brief, model) {
  if (!save) return null;
  if (!token || !process.env.NEXT_PUBLIC_SUPABASE_URL) { console.error("[ot-brief] 저장 불가 — 토큰/환경변수 없음"); return null; }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const meta = { ...(save.meta && typeof save.meta === "object" ? save.meta : {}), generatedAt: new Date().toISOString(), model };
  if (save.kind === "ot" && (phase === "first" || phase === "second" || phase === "first_salesbook" || phase === "salesbook") && typeof save.memberId === "string") {
    const round = phase === "second" || phase === "salesbook" ? Math.min(Math.max(Number(save.round) || 2, 2), 20) : 1;
    // 2차 세일즈북을 다시 만들 때 트레이너가 짠 장 구성(deck: 순서·숨김·사례)은 그대로 이어 붙인다.
    const mkPatch = (prev) => phase === "first" ? { first_assist: { data: brief, meta } }
      : phase === "first_salesbook" ? { first_salesbook: { data: brief, meta } }
      : phase === "salesbook" ? { salesbook: { ...brief, ...(prev?.salesbook?.deck ? { deck: prev.salesbook.deck } : {}) }, salesbookMeta: meta }
      : { brief, briefMeta: meta };
    const { data: rows, error: re } = await sb.from("ot_log").select("id, report")
      .eq("user_id", save.memberId).eq("ot_round", round).order("created_at", { ascending: false }).limit(1);
    if (re) console.error("[ot-brief] 저장 전 조회 실패:", re.message);
    const row = rows?.[0];
    if (row) {
      const { data, error } = await sb.from("ot_log").update({ report: { ...(row.report || {}), ...mkPatch(row.report) } }).eq("id", row.id).select("id");
      if (error || !data?.length) console.error("[ot-brief] 저장 실패(update):", error?.message || "0행(권한)");
      return data?.[0]?.id ?? null;
    }
    const { data, error: ie } = await sb.from("ot_log").insert({
      user_id: save.memberId, ot_round: round, report: mkPatch(null),
      ...(round === 1 ? { goal_type: "appearance", goal_identified: false, closing_result: "none", closing_approach: "other" } : {}),
    }).select("id");
    if (ie || !data?.length) console.error("[ot-brief] 저장 실패(insert):", ie?.message || "0행(권한)");
    return data?.[0]?.id ?? null;
  }
  // 재등록 세일즈북 — 재등록 대본 저장 뒤 이어서 만든 것을 같은 계약 행에(2026-10-11 · 화면이 다시 읽어 '세일즈북 열기')
  if (save.kind === "contract" && phase === "reg_salesbook" && typeof save.contractId === "string") {
    const { data: row } = await sb.from("session_log").select("id, report").eq("id", save.contractId).maybeSingle();
    if (!row) return null;
    const { data, error } = await sb.from("session_log").update({ report: { ...(row.report || {}), reg_salesbook: brief, regSalesbookMeta: meta } })
      .eq("id", row.id).select("id");
    if (error || !data?.length) console.error("[ot-brief] 저장 실패(재등록 세일즈북):", error?.message || "0행(권한)");
    return data?.[0]?.id ?? null;
  }
  if (save.kind === "contract" && phase === "reregister" && typeof save.contractId === "string") {
    const { data: row } = await sb.from("session_log").select("id, report").eq("id", save.contractId).maybeSingle();
    if (!row) return null;
    // 만족도는 화면이 누를 때 바로 저장한다 — 여기서는 저장된 게 없을 때만 채운다(2026-10-06 · 리포트를 만드는 동안
    //   트레이너가 만족도를 바꾸면, 다 만든 뒤 시작할 때 값으로 덮어써지던 버그).
    const sat = !row.report?.reg_satisfaction && save.satisfaction && typeof save.satisfaction === "object" ? { reg_satisfaction: save.satisfaction } : {};
    const { data, error } = await sb.from("session_log").update({ report: { ...(row.report || {}), reg_brief: brief, regBriefMeta: meta, ...sat } })
      .eq("id", row.id).select("id");
    if (error || !data?.length) console.error("[ot-brief] 저장 실패(재등록):", error?.message || "0행(권한)");
    return data?.[0]?.id ?? null;
  }
  console.error("[ot-brief] 저장 요청 형식이 맞지 않음 · phase=" + phase);
  return null;
}

// §5 가드레일 프리앰블 — 도메인 분리(운동=스파링 / 세일즈=실전 클로저). 톤 전체의 뿌리라 신중.
const PREAMBLE = `너는 피트니스 트레이너의 파트너다. 도메인에 따라 두 얼굴을 갖는다.

[★도메인 분리 — 이 프롬프트의 핵심 원칙]
- 운동(방법·방향·자각·큐잉·평가)에서는 '스파링 파트너'다. 왜 이 동작인지 · 무엇을 볼지 · 안전 기준 같은 판단 근거를
  트레이너가 읽는 칸에 분명히 준다. 회원에게 할 말은 짧은 실제 대사로 주되, 트레이너가 근거를 이해하고 자기 톤으로 말하게 한다.
- 세일즈(추천 프로그램·클로징·거절 대응·비유)에서는 '실전 클로저'다. 세일즈는 티칭과 다른 별개
  스킬이라, 영업이 약한 트레이너도 결과를 내도록 '바로 말할 수 있는 실전 멘트'를 확신 있게 준다.
  스파링하지 말고 클로징을 완성시켜라. 단, 낭독용 대본이 아니라 트레이너가 자기 톤으로 소화하고,
  회원이 진짜 원하는 걸 '자기 말로' 꺼내게 리딩하는 멘트여야 한다(외운 티 나는 이식은 역효과).

[환각 금지]
- 트레이너가 입력한 관찰/정보만 재구성한다. 없는 관찰·수치·에피소드를 지어내지 않는다.
- 데이터가 빈약하면 채우지 말고 data_gaps 배열에 "무엇이 부족한지"를 적어 트레이너가 채우게
  남겨둔다. 빈약한 근거로 단정하지 않는다.

[윤리 가드레일 — 세일즈는 강하게 가되 이것만은 금지]
- 세일즈 강도 = '근거·책임의 세기'다(정당한 강조). 압박·조작의 세기가 아니다.
- 허용(강하게 OK): 회원 '본인 데이터'로 말하기 / 사실 기반 손실·가치 프레이밍(회원 목적별로 다르게 —
  진행손실 / 유지·안전 / 효율·정확 / 습관형성. ⚠️"지금 멈추면 원점"은 진행손실형 한 축일 뿐, 기본값 아님) /
  "혼자서는 이 세팅을 못 잡는다"(사실인 책임의 말) / 확신 있는 단일 추천 · 분명한 요청 / 트레이너가 책임질 구체 약속 /
  ★진짜 긴급성(사실 기반: 목표 날짜까지 남은 기간 · 지금 몸 상태 · 지난 OT · 관리 기록에서 확인된 것) /
  그대로 두면 생길 수 있는 구체적 결과(가능성 표현 "~수도 있어요" · 2026-10-07 대표).
- 금지(효과에도 역효과): 허위 긴급성("오늘만 이 가격"), FOMO 남발, 죄책감 유발, 회원 소진
  강요(지쳐서 등록), 의료·완치·치료 표현. — 신뢰가 깨지면 재등록·소개가 무너진다.
- 강한 클로징의 원천은 압박이 아니라 "이 트레이너가 나를 정확히 이해했다"는 공감이다.

[출력 규칙]
- 운동 파트: 판단 근거(왜 · 무엇을 볼지 · 안전)는 트레이너가 읽는 칸에, 회원에게 할 말은 짧은 실제 대사로 준다(긴 설명문 · 통째 강의 금지).
  숫자 처방(각도·템포·세트·중량) 금지, 움직임 '방향'까지만("전방 힙힌지로 둔근 개입").
- 세일즈 파트: 반대다 — 바로 말할 실전 멘트를 '선명하게' 준다(흐린 '예시'로 물러서지 말 것).
  확신 있게, 결과가 나오게. 조작성 바닥선(위 윤리)만 지킨다.
- 반드시 지정된 JSON 스키마만 출력. 설명·마크다운·코드펜스 금지(단 [대사 스타일]의 **핵심 강조** 표시는 예외).`;

// 회원이 직접 읽는 결과물 전용 system — 독자가 트레이너가 아니라 '회원 본인'이라 PREAMBLE(실전 클로저)과 톤이 반대.
//   salesbook · reg_salesbook · first_salesbook · inbody · posture · roadmap에 쓴다(대본 3종은 PREAMBLE).
const SALESBOOK_PREAMBLE = `너는 트레이너가 회원에게 '직접 보여줄' 자료(세일즈북)를 만드는 조력자다. 독자는 트레이너가 아니라 회원 본인이다.

[목적]
- 회원이 "이 트레이너가 나를 정확히 이해했고, 정성껏 준비했구나"를 느끼게 하는 '나를 위한 리포트'.
- 판매 문구가 아니라 증거와 계획. 설득은 압박이 아니라 회원 자신의 데이터로.

[절대 금지 — 회원이 직접 보므로 트레이너용보다 엄격]
- 압박·공포·조작: "지금 안 하면 원점" 강요, 허위 긴급성, 죄책감 유발.
- 트레이너 내부용 요소: 거절 방어 대사, 클로징 멘트/시퀀스, 재정·투자 판단, 세일즈 강도.
- 없는 성과·수치·에피소드 창작(회원이 직접 보므로 거짓은 신뢰를 즉시 무너뜨린다). 관찰/데이터에 있는 것만.
- 의료 단정(진단·치료·완치·교정완료). 통증은 '불편/부담'까지만.
- 숫자 처방(세트·횟수·중량·각도·템포). ★가격(금액)은 값 텍스트에 쓰지 마라 — 앱이 패키지 가격표에서 채운다. 회차·빈도·기간은 주어진 recommended_program 값만.

[AI티 금지 — 사람이 쓴 느낌]
- 두루뭉술 미사여구 금지("최고의 결과를 위해", "귀하의 목표를 달성하기 위해", "함께라면 무엇이든" 류).
- 회원 실명·실제 한마디·구체 관찰만으로 채운다. 트레이너가 실제 회원에게 쓸 법한 따뜻한 구어체("~하셨죠", "~예요").

[goal = 최우선 렌즈]
- 모든 슬라이드를 회원 goal 중심으로. pain은 goal이 통증개선일 때만 주인공.

[출력] 지정 JSON만. 설명·마크다운·코드펜스 금지. 모든 값은 한국어 문장.`;

const g = (v) => (v == null || v === "" ? "없음" : v);
// 건강 체크(OT 신청서 · 건강정보 동의 회원만) — 항목이 있으면 안전 우선(강도 낮게 · 의료 확인 권유 · 진단 금지).
const healthLine = (h) => !h ? "없음" : h.none ? "해당 없음" : `${[...(h.items || []), h.note].filter(Boolean).join(", ")} → ★운동 강도는 보수적으로, 해당 부위 · 상태에 부담 주는 동작은 빼고, 필요하면 '담당 의사와 먼저 확인해 보시면 좋아요' 한마디(진단 · 처방 금지)`;

// ── 클로징 시퀀스 공용 재료(클로징 재설계) — first/second/reregister 공유해 표현 흔들림 방지. ──
// ① stakes 손실·가치 축 taxonomy(goal 유형별 · '원점' 일변도 금지 · 3케이스 검증).
const STAKES_AXIS = `     · 외형 · 체중감량 · 바디라인 → 진행형: 지금까지 쌓은 리듬이 흩어지면 목표 날짜에 못 맞출 수 있다는 것과, 이어 가면 무엇이 보이는지.
     · 통증개선 · 재활 · 교정 → 유지 · 안전형: 오늘 풀린 감각을 관리하지 않으면 다시 불편해질 수 있다는 것(가능성 표현 · 진단 · 단정 금지).
     · 기구사용 · 근력 · 벌크업 → 효율 · 정확형: 혼자 하면 힘 쓰는 지점을 못 찾아 시간을 쓰고도 덜 는다는 것, 같은 시간에 제대로 느는 게 PT.
     · 건강 · 체력 · 활력 → 습관형: 지금 컨디션이 생활 습관이 되려면 초반에 무엇이 필요한지.
     ★문장은 이 회원 관찰 · 기록으로 새로 쓴다(위 설명을 문장으로 옮기지 마라).`;

// 대사 스타일(2026-10-02 대표 요청) — 리포트 3종(first·second·reregister)에 삽입.
//   ① 핵심 한 구절만 **강조**(화면이 포인트 색으로 칠함 · components/ui/Emph) ② 긴 줄표 금지(서버에서도 한 번 더 걸러냄).
const SAY_STYLE = `[대사 스타일]
 - 핵심 강조(**두 별표**)는 꼭 필요한 곳에만: cheat 3줄, ask(요청), proof가 true인 운동의 cue, point_it_out,
   why_now·session_flow의 대사. 각 값에 한 구절만, 10자 안팎으로 짧게(문장 전체·긴 구절 금지). 그 밖의 값에는 별표를 쓰지 마라(강조가 많으면 아무것도 안 보인다).
 - [분량 · 폰 한 화면에 훑어보게] 트레이너가 수업 직전 30초~1분에 훑는다. 길면 안 읽힌다.
   회원 대사(line·cue·point_it_out·trial_close·ask·objection_defense의 line·next_line·homework의 do·workout_intro·echo·next_goal·promise 각 줄)는 한 문장, 60자 안팎.
   stakes·plan_pitch·flush는 두 문장 이내. why·reason·feel·defense·trigger·bridge·so_what은 한 문장. metaphor 한 문장.
   같은 말을 여러 칸에 되풀이하지 마라.
 - 긴 줄표(—, –) 금지. 문장을 끊어야 하면 마침표로 나누고, 이어야 하면 쉼표를 써라.`;

// 비유 재료 규칙(2026-10-02 대표: "직업을 안 적으면? 아무것도 없으면?") — first·second·reregister 공용.
const METAPHOR_RULE = `   [비유 — 어울릴 때만] metaphor는 stakes(왜 PT가 필요한지) 바로 다음에 트레이너가 '쉽게 말하면' 결로 이어 말할 한 문장이다
   (화면이 stakes 바로 아래에 '쉽게 말하면' 이름표를 붙여 보여 준다 · metaphor를 '쉽게 말하면'으로 시작하지 마라 · stakes 문장 안에 비유를 또 넣지 마라). ★요청(ask)에는 비유를 넣지 마라.
   재료 찾는 순서: ① 직업 → ② 목표의 장면(날짜가 있는 일) → ③ 문진에 적힌 것(그만둔 이유 · 가능한 시간 · 받아본 운동) →
   ④ 실제로 입력된 생활 → ⑤ 누구나 겪어본 일상.
   ★입력되지 않은 직업 · 생활을 짐작하지 마라. ★뻔한 비유(저축 · 자동차 정비 · 씨앗 · 건물 기초 · 마라톤) 금지.
   ★어울리는 비유가 없으면 metaphor는 빈 문자열(억지 비유보다 없는 게 낫다).`;

// ② 회원 대사 전문용어 금지(전 phase 공통 · 출력 규칙에 삽입).
const MEMBER_LANG = `[회원 대사 용어] 회원에게 던지는 모든 대사(trial_close·ask·flush·point_it_out·opening 등)엔 트레이너
 전문용어 금지(세팅·견갑·흉추·힙힌지·둔근개입 등 ❌). 회원이 아는 말로 풀어라("자세 하나 잡아드렸더니 /
 힘이 제대로 들어가는 지점 / 각도만 살짝 바꿔드렸는데"). ★단 트레이너가 읽는 point(왜 시키나)·why 류엔 용어 OK.`;

// ── 당일 체감 운동 강화(C-2) — first/second 공유. 재활·기능성 위주 + 머신 도망 금지. ──
// ① session_plan 삽입: 쉬운·머신 위주 탈피.
const SAMEDAY_PLAN = `   ★쉬운·머신 위주로 도망가지 마라. 회원이 불편·재활·교정(거북목·라운드숄더·골반·무릎 등) 목적이면,
   굳은 데를 직접 풀어 '그날 몸이 가벼워지는 걸 체감'시키는 기능성·재활·교정 동작 위주로 짜라(머신은 보조).
   ⚠️보유 장비가 있어도 재활·교정 목적엔 기능성 동작이 우선 — 쉽고 무난한 동작은 체감이 안 나 클로징으로 안 이어진다.`;

// 성별 반영(배치 A) — first/second session_plan 주입. goal 우선, 성별은 보조.
const GENDER_HINT = `   ★성별(gender)이 주어지면 동작 선택·표현을 그에 맞춰라(흔한 목표·체형 경향 반영). 단 회원 goal이 항상
   우선 — 성별은 보조 축이고, 고정관념으로 goal을 덮지 마라(성별 미입력이면 이 줄 무시).`;

// OT 운동 고르는 기준(2026-10-02 대표 피드백) — first exercises · second session_plan 공유.
//   "미니밴드 엉덩이 들기·벤치 앉았다 일어나기·서서 케이블 당기기"처럼 안 배워도 아는 쉬운 동작이 나왔다.
const EXERCISE_BAR = `   ★고르는 기준: OT 운동은 '코칭을 받으면 다르다'를 보여주는 자리다. 회원이 이미 알거나 혼자 해도 되는 단순
   동작(벤치 앉았다 일어나기·미니밴드 엉덩이 들기·서서 케이블 당기기·머신에 앉혀 미는 동작 류)은 메인·자극
   운동으로 고르지 마라. ★'배워야 제대로 되는 동작', 트레이너 큐 한마디에 느낌이 확 달라지는 동작을 골라라
   (예: 힙힌지 계열 데드리프트 변형, 고블릿·스플릿 스쿼트, 견갑을 쓰는 로우·랫풀다운, 바벨 힙 쓰러스트, 푸시업
   패턴 교정 등 · 목록은 발판일 뿐 회원에 맞춰 매번 다르게). 초보·여성·불편 부위가 있어도 동작 수준을 쉬운 걸로
   낮추지 말고, 무게·가동범위·변형으로 부담을 낮춰 '어려운 동작이 되네'를 느끼게 하라.`;

// ② target_exercise/proof(증거 동작) 삽입: 당일 체감 콕 집기.
const SAMEDAY_PROOF = `   ★증거 동작은 '당일 체감'이 핵심이다. 거북목·라운드숄더·골반교정·무릎 등 불편·재활 목적이면, 그 부위를
   직접 겨냥해 그 자리에서 "어? 목이 트이네 / 엉덩이에 딱 들어오네"를 느끼게 하는 기능성 동작으로. 머신에
   앉혀 편하게 시키는 걸로 도망가지 마라.`;

// ③ 의료 가드레일 재표현: 동작은 강하게, 표현은 '치료' 아닌 '체감'.
const REHAB_TONE = `   ★재활·교정 동작은 강하게 넣되(약한 동작 금지), 표현은 의료가 아니라 체감으로 — "거북목을 교정/치료한다"(❌)
   → "굳은 목·어깨를 풀어 그날 목이 가벼워지는 걸 체감"(✅). 진단·치료·완치·교정완료 단정 금지. 통증은 '불편/부담'까지만.`;

// ③ closing_sequence JSON 예시(스키마 · 3 프롬프트 공유).
const CLOSING_SEQ_JSON = `"closing_sequence": { "echo": "되짚기 한 문장", "trial_close": "회원이 말하게 하는 열린 질문 한 문장 + (기다림)", "stakes": "필요 · 왜 지금(두 문장 이내)", "next_goal": "앞으로의 그림 한 문장", "promise": ["트레이너가 책임지고 할 구체 행동 한 문장", "또 하나"], "plan_pitch": "제안 + 얻는 것(두 문장 이내 · 가격 숫자 없음)", "ask": "초대하는 요청 한두 문장", "ask_style": "확인형|선택형|목표형|이어가기형 중 하나", "hold": "요청 직후 트레이너 행동 지시(회원 대사 아님)", "flush": "물러설 때 진짜 이유를 묻는 대사" }`;
// OT(1차·2차+) 전용 — 오늘 결정이 안 될 때: 다음 OT를 그 자리에서 잡고, 다음 수업 전까지 회원에게 부탁할 것(숙제).
const CLOSING_SEQ_JSON_OT = CLOSING_SEQ_JSON.replace(/ \}$/, `, "fallback": { "next_line": "가까운 날로 다음 OT를 잡자며 회원 일정을 묻는 열린 질문(트레이너가 요일·시간을 정해 묻지 않음)", "homework": [ { "do": "다음 수업 전까지 회원에게 그대로 말할 부탁 한 문장", "why": "왜 하는지 한 줄" } ] } }`);

// 세일즈북을 넘기며 클로징(2026-10-11 시안) — 숫자 · 사진 · 가격은 세일즈북 화면이 보여 주고, 대본은 화면에 없는 말만.
//   클로징 비트(echo · trial_close · stakes · next_goal · promise · plan_pitch · ask · flush)는 그대로 두고, 장과 장 사이를 잇는 짧은 줄(book_lines)만 더 쓴다.
//   어느 장에서 어느 비트를 말할지는 화면(PrepReport BookClosing)이 정한다.
const BOOK_RULE = `[세일즈북을 넘기며 하는 말 — book_lines] 클로징은 트레이너가 회원 세일즈북을 한 장씩 넘기며 한다.
 ★세일즈북 화면이 숫자 · 사진 · 사례 · 가격을 이미 보여 주니, book_lines는 화면에 적힌 숫자를 다시 읽지 말고
 '그게 무슨 뜻인지 · 회원과 무슨 상관인지'만 짧게(한 문장 · 40자 안팎). 위 closing_sequence 대사와 같은 말을 되풀이하지 마라.`;

// ④ 클로징 4비트 지시(재료만 phase별 주입 · trial_close→stakes→ask→hold→flush).
// 같은 틀 방지(2026-10-11 대표: "요청이 어색하다 · 다 똑같다") — 30개 대본이 한 문장 모양으로 나온 원인이
//   예문 · '반드시 이 모양' 규칙이었다. 예문을 빼고 '쓰지 말 것' 목록 + 회원 재료로 채우게 한다.
const ANTI_TEMPLATE = `[쓰지 말 것 — 모든 대본이 같은 모양이 되는 표현]
 - "○○도 ~잖아요, 그 ○○(역할)를 제가 해드릴게요 · 맡을게요 · 지켜드릴게요" 구조(비유 + 역할 넘겨받기)
 - "다음 주부터 바로 시작하시죠" · "바로 시작하시죠" · "그대로 이어가시죠" 같은 정해진 요청 문구
 - 계약 · 결제 · 남은 회차 얘기("남은 수업 끝나는 대로" · "결제" · "등록해 드릴게요")
 - "제가 보기엔 ○○님은 ~가 맞아요"로 시작하는 문장
 - "고민은 ~만 늦출 뿐" · "~ 아시죠?"로 끝나는 말장난 · 직업 용어로 하는 농담(커밋 · 결재 · 인수인계 · 가봉 등)
 - "습관이 굳기 전" · "결국 제일 아끼는 길" · "처음부터 다시" · "시간과 돈을 아끼는" 같은 상투 문구
 - 요청 끝을 "같이 가 보실래요 · 같이 가볼까요 · 함께 가 보실래요 · 같이 시작해 보실까요"로 맺는 것(트레이너가 대본을 여러 개 보면 다 같아 보인다)
   → 이 회원 목표의 행동(무엇을 만들고 · 빼고 · 잡고 · 준비하는지)으로 맺거나, 회원의 결정을 직접 묻는 말로 맺는다. 대본마다 다른 말로.
 - trial_close를 "오늘(그동안) 어떤 게 제일 다르게 느껴지셨어요?" 같은 누구에게나 쓸 수 있는 질문으로 쓰는 것
   → 오늘(또는 그동안) 실제로 한 운동 · 장면 · 숫자를 콕 집어 묻는다.
 ★회원마다 문장이 달라야 한다. 문장을 이 회원이 실제로 한 말 · 적은 목표 · 오늘(또는 그동안) 관찰 · 기록 숫자로 채우면 저절로 달라진다.`;

// ④ 클로징 — 회원이 스스로 'PT를 받아야겠다'고 확신하게 만드는 대화(2026-10-11 재설계).
//   다섯 가지 확신: 필요 · 효과 · 가치 · 지속 · 이 트레이너에 대한 신뢰. 비유는 선택(요청에 넣지 않음) · 웃으며 한마디(nudge) 없음.
// gainHint = plan_pitch 둘째 문장 지시(기본 = 예전 그대로 · 2차+는 결과 보장 없는 판을 넘긴다 · 2026-10-13).
const PITCH_GAIN_DEFAULT = `이어서 그걸로 회원이 얻는 것(목표까지의 그림 ·
     달라질 생활)을 한 문장.`;
function closingSeqInstruction({ num, echoHint, trialHint, nextHint, askHint, tone = "", fallback = false, gainHint = PITCH_GAIN_DEFAULT }) {
  return `${num} closing_sequence(클로징 — 압박이 아니라 회원이 스스로 확신하게 만드는 대화): 회원이 끝에
   "PT 받아야겠다 · 도움이 많이 되겠다 · 돈이 아깝지 않겠다 · 아직 더 하는 게 맞다 · 이 쌤이랑이면 후회 없겠다"를
   느끼게 하는 순서다. 각 칸은 트레이너가 그대로 말할 대사(짧게). 순서대로:${tone}
   - echo(되짚기 · 한 문장): ${echoHint} 회원이 쓴 말이나 반응을 그대로 돌려준다(없는 말 지어내지 마라 · 없으면 적은 목표로).
   - trial_close(회원이 말하게 · 한 문장): ${trialHint} 네/아니요로 끝나지 않는 열린 질문 하나 + 끝에 (기다림).
     회원이 자기 입으로 효과를 말하게 하는 게 목적이다(트레이너가 대신 단정하지 마라).
   - stakes(필요 · 두 문장 이내): 이 회원 goal 기준으로 왜 혼자보다 PT인지 + 왜 지금인지. 근거는 실제 관찰 · 기록 1개.
     결과는 장면이 그려지게 가능성 표현(~수도 있어요)으로 · 진단 · 단정 · 겁주기 과장 · 허위 마감 금지.
     손실만 말하지 말고 회원 목표와 직접 잇는다. goal 유형별 축 —
${STAKES_AXIS}
   - next_goal(앞으로의 그림 · 한 문장): ${nextHint}
   - promise(배열 2개 · 각 한 문장): 이 트레이너가 이 회원에게 책임지고 할 구체 행동. 매 수업 무엇을 하는지 · 언제 무엇을
     같이 확인하는지 · 이 회원의 걱정(문진 · 관찰 · 그만둔 이유 · 일정)에 대해 무엇을 해 줄지. 이 회원 정보에서 나온 것만.
     "최선을 다할게요" 같은 막연한 말 금지 · 앱 기능 이름 나열 금지(회원이 알아들을 말로).
   - plan_pitch(제안 + 얻는 것 · 두 문장 이내): [recommended_program]의 pick_ref 패키지 하나를 권한다 — 빈도 · 기간(또는 총 회차)
     + 왜 그게 이 회원에게 맞는지 근거 1개(목표 시점 · 가능 빈도 · 몸 상태). ${gainHint} ★세션수는 pick_ref 패키지의 실제 sessions 값 그대로(창작 금지). ★가격 숫자(원 · 회당)는 쓰지 마라
     — 화면이 이 대사 바로 아래에 가격 한 줄을 따로 보여 준다. "비싸지 않아요" 같은 방어 말투 금지.
   - ask(초대하는 요청 · 한두 문장): 무엇을 하자는지(PT · 빈도 · 기간 또는 총 회차)는 분명히. 문장 모양은 자유 — 아래
     ask_style 중 이 회원에게 맞는 하나를 골라 그 결로 써라. 같은 요청 문구를 반복하지 마라.
       · 확인형: 신중하거나 걱정이 큰 회원(통증 · 처음 · 예전에 그만둠) — 함께 가 볼지 부드럽게 묻는다.
       · 선택형: 일정이 바쁜 회원 — 빈도(주 2회 / 3회처럼)를 회원이 고르게 묻는다. ★요일 · 시간은 고르게 하지 마라.
       · 목표형: 목표 날짜가 분명한 회원(결혼식 · 촬영 · 검진) — 그 날까지 같이 가자고 묻는다.
       · 이어가기형: 재등록 — 다음 목표를 같이 가자고 묻는다.
     ${askHint}
     ★요일 · 시간을 트레이너가 정해 내밀지 마라(정해지면 회원 일정을 물어 맞춘다). 시작 시기는 말해도 되지만 필수는 아니다.
   - hold: 요청 직후 '트레이너 행동 지시'(회원 대사 아님) — 먼저 말하지 말고 회원 답을 기다린다.
   - flush: 회원이 물러설 때 진짜 이유를 꺼내는 재요청 대사(무엇이 걸리는지 열어서 묻기). 그 이유별 깊은 대응은 아래
     objection_defense가 잇는다. 그래도 오늘 결정이 어려우면 붙잡지 말고, 다음 만남을 가까운 날로 잡자며 회원 일정을 묻는 말로 끝맺는다.
${ANTI_TEMPLATE}${fallback ? `
   - fallback(오늘 결정이 안 될 때 · 붙잡지 않는다): next_line = 다음 OT를 가까운 날(이번 주, 며칠 안)로 잡자고
     권하되 날짜 · 시간은 회원에게 묻는 열린 질문 + 왜 가까운 날이 좋은지 한마디. 트레이너가 요일 · 시간을
     정해 양자택일로 묻지 마라.
     homework = 다음 수업 전까지 회원에게 부탁할 것 2개. 오늘 한 운동 · 확인한 문제와 이어지는 집에서 하는
     스트레칭 · 자세 연습, 생활 습관, 기록해 올 것(예: 식사 사진 · 불편했던 순간) 중에서. 각 {do: 회원에게 그대로 말할
     부탁 한 문장(방법과 느낌 위주), why: 왜 하는지 한 줄 — 다음 OT에서 무엇을 확인할지}. ★숫자 처방(세트 · 횟수 ·
     시간 · 중량) 금지 · 통증 관련은 "불편하면 바로 멈추세요"를 덧붙여라. 다음 OT에서 이걸 확인하며 다시 클로징으로
     잇는 다리다.` : ""}`;
}

// ── ① firstPrompt — 사전무장 컨닝페이퍼(3스텝: 인사 → 즉효운동 3~4개 → 클로징). 3분전 스캔용. ──
// 내 라이브러리에서 별표한 운동자료(library_item.favorite) — 1차 · 2차+ · 재등록 대본이 같이 쓴다(2026-10-07).
//   AI가 영상 내용을 보는 게 아니라 제목 · 분류 · 메모를 보고 고른다. [fn] 번호가 lib_ref(s)로 돌아온다.
function favoritesBlock(favorites) {
  const favs = Array.isArray(favorites) ? favorites.filter(Boolean) : [];
  return favs.length
    ? favs.map((f, i) => `[f${i}] ${f.category ? f.category + " · " : ""}${g(f.title)}${f.note ? ` (${f.note})` : ""}`).join("\n")
    : "없음(즐겨찾기한 운동자료 없음)";
}

// 대본이 쓴 자료 번호(lib_ref · lib_refs)에 그 자료의 제목 · 링크를 붙여 저장한다 — 나중에 라이브러리 순서가 바뀌거나
//   자료를 지워도 대본의 '내 자료' 링크가 엉뚱한 자료를 가리키지 않게(attachPkgSnapshots와 같은 생각).
function attachLibSnapshots(out, favs) {
  if (!out || typeof out !== "object" || !Array.isArray(favs) || !favs.length) return out;
  const at = (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= favs.length) return null;
    const f = favs[i] || {};
    const url = typeof f.url === "string" && /^https?:\/\//i.test(f.url) ? f.url : "";
    return { title: String(f.title || "").slice(0, 120), url };
  };
  const fix = (arr) => arr.map((x) => (x && typeof x === "object" && Number.isInteger(x.lib_ref) ? { ...x, lib: at(x.lib_ref) } : x));
  if (Array.isArray(out.exercises)) out.exercises = fix(out.exercises);
  if (Array.isArray(out.session_plan)) out.session_plan = fix(out.session_plan);
  if (out.proof && Array.isArray(out.proof.moves)) out.proof.moves = fix(out.proof.moves);
  if (Array.isArray(out.lib_refs)) out.libs = [...new Set(out.lib_refs.filter(Number.isInteger))].map(at).filter(Boolean);
  return out;
}

// 1차 OT 방문 목적(2026-10-12 · OT 신청서 'OT에서 가장 알고 싶은 것' · 운동 목표와 별개).
//   목적을 모르면(예전 회원 · 안 고름) 이 블록 없이 예전 프롬프트 그대로. soft = PT를 생각하고 온 게 아닐 수 있는 회원.
const OT_PURPOSE_GUIDE = {
  machine: { soft: true, guide: `기구 사용법을 충분히 알려 주는 수업이 중심이다. 메인 동작 · 목표 부위 자극 칸은 센터 기구로 고르되(이 목적이면 아래 운동 '★고르는 기준'의 머신 동작 제한보다 이 목적이 우선), 세팅 하나로 느낌이 달라지는 기구 동작으로. 기구마다 회원이 혼자 다시 할 수 있을 만큼 세팅 · 자세 · 느낄 곳을 알려 준다. 그 과정에서 '같은 기구도 회원님 몸에 맞춰 잡으면 느낌이 다르다'를 체감시키고, 클로징은 '사용법은 오늘 알려 드렸고, 목표에 맞는 순서 · 강도 조절은 계획과 코칭이 필요하다'로 개인 코칭 · 운동 계획의 가치에 잇는다.` },
  form: { soft: true, guide: `회원의 움직임을 같이 보고 실제 차이를 확인하는 수업이다. '몸 상태 체크'와 '처음과 비교' 칸이 주인공 · 메인 동작에서 큐 하나로 달라지는 차이를 회원이 직접 확인하게 한다. 확인된 차이만 근거로 쓰고, 아직 확인 안 된 문제는 '~일 수 있어요'로. 클로징은 오늘 본 차이를 혼자서는 유지하기 어렵다는 점과 꾸준한 점검의 가치로 잇는다.` },
  self: { soft: true, guide: `혼자서도 운동할 수 있게 가르치는 수업이다. 동작마다 혼자 할 때 꼭 기억할 한 가지를 회원 말로 알려 주고, 오늘 배운 걸로 혼자 할 때의 순서도 짧게 안내한다. 클로징은 먼저 '혼자 하실 수 있게 알려 드렸다'를 인정하고, 혼자 하다 막히기 쉬운 지점(입력된 그만둔 이유 · 운동 경험이 있으면 그걸로)을 근거로 정기 점검 · 지속적인 관리의 가치를 소개한다.` },
  plan: { soft: false, guide: `목표에 맞는 운동 순서와 관리 방향을 구체적으로 보여 주는 수업이다(주 몇 번 · 무엇부터 · 어떤 순서로 · 숫자 처방 없이). workout_intro · so_what · next_goal에 그 계획이 드러나게 하고, 클로징은 그 계획을 같이 실행하는 방법으로 추천 플랜을 분명하게 제안한다(강요 없이).` },
  pt: { soft: false, guide: `PT 수업 방식과 비용이 궁금해서 왔다. 운동으로 이 회원에게 필요한 것을 확인한 뒤, 추천 플랜 · 비용을 명확하게 설명하고 오늘 등록을 분명하게 제안한다.` },
  trial: { soft: true, guide: `가볍게 체험하러 왔다. 유용하고 즐거운 운동 경험과 신뢰 형성이 먼저다. 오늘 운동에서 회원이 '도움이 됐다'를 느끼게 하고, 확인한 것을 근거로 '회원님한테 맞는 방법을 한번 상담해 볼까요' 결로 자연스럽게 상담에 잇는다.` },
};

// 수업 전에 쓰는 대본이라 회원 반응 · 결과를 모른다(2026-10-13 실제 생성 검토 · 대표) — 1차 · 2차+ 공용(모든 칸).
const BEFORE_CLASS_RULE = `[★수업 전 대본 — 회원 반응 · 결과를 미리 단정하지 마라]
 - 이 대본은 수업 전에 쓴다. 회원이 실제로 무엇을 느낄지 모른다. 체감을 확정하는 말("엉덩이가 같이 일하죠", "앉는 게 훨씬 편하죠",
   "등이 당겨지죠")을 쓰지 말고, 질문으로 확인하게 써라("아까보다 어디에 힘이 들어가는 느낌이세요?", "처음과 비교했을 때 어떤 차이가 있으세요?").
 - 운동 효과 · 체형 변화 · 체중 감량 결과를 보장하지 마라("3개월이면 몸 라인이 달라져요" ❌). 결과는 '~를 목표로 가요' · '~를 같이 확인해요'로.
 - 대신 트레이너가 실제로 할 일(매 수업 무엇을 하는지 · 언제 무엇을 다시 재서 같이 확인하는지 · 어떤 순서로 강도를 올리는지)은
   구체적이고 자신 있게 말하라. 소극적이거나 추상적인 말("열심히 해 볼게요", "도움이 될 거예요")로 물러서지 마라.
 - 거절 대응 · 클로징에서도 '오늘 이미 확인했다'는 결과를 단정하지 말고, 오늘 같이 한 과정(같이 맞춰 본 것)으로 말하라.
`;

// 재등록 다음 목표 숫자(2026-10-13 대표) — 숫자 목표 제안은 PT 세일즈에 필요하다. 막지 말고, 데이터에 근거한 도전적 · 현실적 제안으로.
const REREG_GOAL_RULE = `[★다음 목표 숫자 — 데이터에 근거한 도전적 제안]
 - 이미 정한 목표가 먼저다: [숫자 목표](트레이너 확인) · [★트레이너가 정한 다음 목표]가 있으면 그대로 쓰고 새 숫자로 바꾸거나 키우지 마라.
 - 정한 숫자 목표가 없으면, 실제 기록이 있는 지표(인바디 · 운동 무게 · 수행 기록)로 다음 기간 숫자 목표를 '제안'할 수 있다. 숫자 목표 제안은 좋다 —
   회원이 '이 정도 변화를 해 보고 싶다'고 느낄 만큼 매력적이고 도전적이되, 트레이너가 근거를 설명할 수 있어야 한다.
   근거 = 출발 수치 · 지금까지 변화 속도([인바디 한 달 평균 변화]) · 다음 기간 길이(추천 플랜의 '진행 계산(앱)') · 출석 리듬 · 운동 경력 · 생활 패턴 · 불편 부위.
   지난 속도를 기계적으로 늘리지도, 누구에게나 같은 작은 변화로 줄이지도 마라. 모든 회원에게 같은 감량률 · 근육 증가량을 쓰지 마라.
   지금까지 정체였다면 정체를 인정하고, 이번 기간에 무엇을 바꾸면(리듬 · 강도 · 운동 구성) 어디까지 가 볼 수 있는지로 제안하라.
 - 단위를 구분하라: 체지방률은 %p, 체지방량 · 체중 · 골격근량은 kg. 체지방 감소와 골격근 증가를 함께 제안하면 이 회원(운동 경력 · 나이 · 지금까지 변화)에게 현실적인 조합인지 따져라.
 - 새로 제안하는 숫자는 제안형으로: "다음 기간엔 체지방률 ○%대를 목표로 잡아 볼 수 있어요" · "○kg까지 도전해 볼 만해요".
   이미 합의한 목표처럼("목표는 ○%예요") 쓰거나 달성을 약속하지 마라("만들어 드릴게요" · "됩니다" ❌).
 - 숫자 목표에는 PT에서 어떻게 갈지를 붙여라(어떤 운동 · 강도 조절 · 언제 다시 재서 같이 확인하는지 · 피드백).
 - 인바디 기록이 없으면 체지방률 · 체지방량 · 골격근량 숫자를 만들지 마라(운동 무게 · 수행 목표나 숫자 없는 목표로).
   불편 부위 · 건강 주의가 있으면 무리한 숫자를 내지 말고 보수적으로, 필요하면 숫자 없이.
 - 숫자 목표가 없어도 된다. 다음에 키울 능력과 관리 계획만으로도 설득력 있게 말할 수 있다.
`;

// 재등록 대본 · 재등록 세일즈북 공용 — 기록으로 확인된 것만(2026-10-13 실제 AI 시험: 출석 과장 · 근거 없는 혜택 · 결과 단정이 나왔다).
const REREG_FACT_RULE = `[★재등록 — 기록으로 확인된 것만 말하라]
 - 출석: 앱은 '한 번도 안 빠진 출석'을 확인해 주지 않는다. "한 번도 빠지지 않고 · 한 주도 흐트러지지 않고 · 빠짐없이" 같은 절대 표현 금지 → "꾸준히 이어 오셨어요"처럼 기록에 맞게.
 - 혜택 · 서비스: 할인 · 회당 단가 조정 · 추가 서비스(식단 관리 · 추가 상담 · 무료 수업 등) · 특별 혜택은 입력에 센터가 준다고 적힌 것만 말한다. 지금 입력엔 없으니 어느 칸에서도 새로 약속하지 마라(거절 대응 포함). 관리 약속은 이미 정해진 것(대본의 promise · 세일즈북은 [대본과 같은 상담 방향]의 관리 약속)만.
 - 목표: 체중 · 체지방률 · 근력 숫자는 앞으로의 목표로만 쓴다(정한 목표는 '~를 목표로 가요' · 새로 제안하는 숫자는 [★다음 목표 숫자]대로 제안형). "만들어 드릴게요 · 25%대 만들고" 같은 달성 약속 금지.
 - 원인: 인바디 · 무게 변화는 기록 사실로 말하고, 원인을 운동 · 특정 관리 방식 하나로 단정하지 마라("~ 덕분에 빠졌어요" ❌ → "그동안 이만큼 달라졌어요").
 - 기록으로 확인된 성과는 분명히 칭찬하고, 재등록 제안도 분명하게 유지한다.
`;
// 출력 안전망(2026-10-13) — 프롬프트를 어겨도 출석 절대 표현은 '꾸준히'로 바꾼다(재등록 대본 · 재등록 세일즈북). 다른 뜻의 '빠지지 않고'(체지방이 빠지지 않고 등)는 건드리지 않게 출석 맥락만.
const ATTEND_ABS = [
  [/(한\s*번|한\s*주|하루|한\s*달)도\s*(안\s*빠지고|안\s*빠지셨|빠지지\s*않(고|으시고|으셨|았)|빠짐없이|흐트러지지\s*않(고|으시고|았)|거르지\s*않(고|으시고|았)|쉬지\s*않(고|으시고|았))/g, "꾸준히"],
  [/빠짐없이/g, "꾸준히"],
  [/빠지지\s*않고(?=\s*(오|나오|운동|수업|출석|다니))/g, "꾸준히"],
];
// 바꾼 뒤 '꾸준히 … 꾸준함'처럼 같은 말이 겹치면 다듬는다(바꾼 문장에만 · 2026-10-13). 꾸준함 · 노력 · 기록은 받침이 같아 조사(이/을/은)가 그대로 맞는다.
const ATTEND_DUP = [
  [/주\s*(\d+)\s*회씩?\s*꾸준히\s*(?:오신|나오신|운동하신|다니신|오셨던)\s*꾸준함/g, "주 $1회 운동을 이어 오며 쌓은 노력"],
  [/꾸준히(\s+[가-힣]+\s?온)\s+꾸준함/g, "꾸준히$1 기록"],
  [/(꾸준히(?:\s+[가-힣]+){1,3}?\s+)꾸준함/g, "$1노력"],
  [/꾸준히\s+꾸준히/g, "꾸준히"],
  [/꾸준히\s+꾸준하게/g, "꾸준하게"],
];
function softenAttendance(node) {
  if (typeof node === "string") {
    const out = ATTEND_ABS.reduce((s, [re, to]) => s.replace(re, to), node);
    return out === node ? node : ATTEND_DUP.reduce((s, [re, to]) => s.replace(re, to), out);
  }
  if (Array.isArray(node)) return node.map(softenAttendance);
  if (node && typeof node === "object") { const o = {}; for (const k of Object.keys(node)) o[k] = softenAttendance(node[k]); return o; }
  return node;
}

// 패키지 진행 계산 줄(2026-10-13 · lib/pkgPace) — 1차 · 2차+ · 재등록 가격표 줄 뒤에 붙인다. AI는 이 숫자만 쓴다.
//   freqs = [{ f, label }] (label 예: "주 2회" · "지금까지 주 평균 1.8회"). 기간을 넘겨도 '못 쓰는 상품'이 아니라 '센터 확인'으로 적는다.
function paceText(p, freqs) {
  const at = ({ f, label }) => {
    const r = pkgPace(p, f);
    if (!r) return "";
    const w = Math.round(r.weeks);
    return `${label}면 약 ${w}주(${r.weeks < WEEKS_PER_MONTH ? "1개월 안" : `약 ${Math.round((r.weeks / WEEKS_PER_MONTH) * 2) / 2}개월`})`;
  };
  const parts = freqs.map(at).filter(Boolean);
  if (!parts.length) return "";
  return ` · 진행 계산(앱 · 예상 진행 기간)=${parts.join(" · ")}`;
}
// 회원 주당 횟수를 알면 그것만, 모르면 주 2회 · 3회 두 경우.
const paceFreqs = (f) => (f ? [{ f, label: `주 ${f}회` }] : [{ f: 2, label: "주 2회" }, { f: 3, label: "주 3회" }]);
// 2차+ · 재등록 빈도 후보(2026-10-13) — 신청서 횟수 · 지금까지 주 평균에 더해 주 1 · 2 · 3회 계산도 준다.
//   회원이 나중에 다르게 말한 빈도(예: 1차에서 '일주일에 한 번밖에')로 다시 짤 때도 앱 계산 숫자가 있게. label = AI용 · show = 회원 화면(세일즈북 meta)용.
const avgOf = (v) => { const n = Number(v); return n > 0 && n <= 7 ? Math.round(n * 10) / 10 : null; };
function freqOptions({ applied = null, avg = null } = {}) {
  const out = [];
  if (applied) out.push({ f: applied, label: `주 ${applied}회(신청서)`, show: `주 ${applied}회` });
  if (avg) out.push({ f: avg, label: `지금까지 주 평균 ${avg}회`, show: `지금까지 주 평균 ${avg}회` });
  for (const f of [1, 2, 3]) if (!out.some((o) => Math.abs(o.f - f) < 0.05)) out.push({ f, label: `주 ${f}회`, show: `주 ${f}회` });
  return out;
}
// 세일즈북 플랜 meta가 쓸 빈도(2026-10-13) — 대본이 정한 주당 횟수(recommended_program.weekly · 후보 안의 값만)로 대본과 같은 계산.
//   대본이 null(기록이 엇갈려 트레이너 확인 필요)이면 빈도 계산 없이 상품에 적힌 기간만 · weekly가 없는 옛 대본은 예전 기준(fallback).
function planFreqs(rp, options, fallback) {
  const o = rp && typeof rp === "object" ? rp : {};
  if (Object.prototype.hasOwnProperty.call(o, "weekly")) {
    if (o.weekly == null) return [];
    const w = Number(o.weekly);
    const hit = Number.isFinite(w) ? options.find((x) => Math.abs(x.f - w) < 0.05) : null;
    if (hit) return [hit];
  }
  return fallback;
}
// 저장 전 정리 — weekly가 후보 밖이면 지운다(세일즈북은 예전 기준으로) · null은 그대로(트레이너 확인 필요 표시).
function normalizeWeekly(out, options) {
  const rp = out && typeof out === "object" && out.recommended_program && typeof out.recommended_program === "object" ? out.recommended_program : null;
  if (!rp || !Object.prototype.hasOwnProperty.call(rp, "weekly") || rp.weekly === null) return out;
  const w = Number(rp.weekly);
  const hit = Number.isFinite(w) ? options.find((x) => Math.abs(x.f - w) < 0.05) : null;
  if (hit) rp.weekly = hit.f; else delete rp.weekly;
  return out;
}

// 상품 기간의 뜻(2026-10-13 대표 정정) — 상품의 duration('3개월' 등)은 주 2회 정도 기준의 예상 진행 기간 안내이지 계약 만료일이 아니다.
//   앱에도 계약 만료일 · 강제 소진 규칙이 없다(session_log에 만료 칸 없음 · 남은 수업은 회차로만 계산). 그래서 '기간 초과' 경고를 쓰지 않는다.
const DURATION_MEANING = `   ★상품의 duration(예: '3개월')은 주 2회 정도로 운동했을 때의 예상 진행 기간 안내이지 계약 만료일이 아니다.
     '이용 기간 초과' · '기간 안에 다 써야' · '센터 규정 확인' · '기간 연장' 같은 만료를 전제한 말을 쓰지 마라.
     기간을 말할 땐 '주 2회면 약 15주(약 3.5개월) 예상'처럼 회원 빈도에 따른 예상 진행 기간으로만 말한다.`;
// 2차+ · 재등록 추천 패키지 규칙(2026-10-13 · 1차와 같은 원칙) — 계산은 앱 · 예상 기간에 맞추려고 키우지 않는다.
function laterPickRule(step1) {
  return `   ★고르는 순서:
     ① ${step1}
     ② 회원 빈도로 하면 얼마나 걸리는지는 '진행 계산(앱)'으로 본다. 예상 기간은 참고일 뿐, 패키지를 키우는 이유가 아니다.
     ③ 예상 기간에 맞추려고 더 큰 패키지로 올리지 마라. 가격 순서(가장 비싼 · 가장 싼)를 기본값으로 삼지 마라. 반대로 무조건 가장 작은 패키지로 물러서지도 마라.
   ★계산: 회차 · 빈도 · 기간은 '진행 계산(앱)' 숫자만 써라. 빈도 × 기간으로 회차를 거꾸로 맞추지 마라(주 2회로 3개월이면 약 26회
     전후다. 30회가 아니다). frequency · duration · session_logic · plan_pitch · ask · cheat의 숫자는 모두 같아야 한다. 근거가 없으면 숫자를 지어내지 말고 빼라.
${DURATION_MEANING}`;
}

/* 세일즈북 플랜 장 맞추기(2026-10-13) — 회원이 직접 보는 화면이라 숫자는 AI가 아니라 실제 상품 설정에서.
   A = 대본이 고른 추천(pick_pkg/pick_ref) · B = 대본의 대안(alt_pkg/alt_ref · 없으면 AI가 고른 다른 패키지 · 같거나 없으면 뺀다).
   패키지는 저장된 스냅샷 id로 지금 가격표에서 찾고(순번이 바뀌어도 같은 상품), 못 찾으면 스냅샷 그대로.
   meta = 대본과 같은 빈도 계산(freqs · planFreqs) — 하나면 '주 N회 기준 약 W주(약 M개월) 예상' · 둘 이상이면 '주 2회면 약 … · 주 3회면 약 … 예상'
   (대본도 같은 두 경우로 말한다) · 없으면 '예상 기간 …'(상품에 적힌 기간) · sessions_label = '함께 K회'. 모르는 건 비운다. attachPkgSnapshots 전에 부른다. */
function planMeta(pkg, freqs) {
  // 상품 기간은 예상 진행 기간 안내(만료일 아님 · 2026-10-13 대표 정정). 숫자는 대본의 '진행 계산(앱)'과 같은 pkgPace · 같은 반올림.
  const list = Array.isArray(freqs) ? freqs : [];
  const one = (o) => {
    const r = pkgPace(pkg, o.f);
    return r ? `약 ${Math.round(r.weeks)}주${r.weeks < WEEKS_PER_MONTH ? "" : `(약 ${Math.round((r.weeks / WEEKS_PER_MONTH) * 2) / 2}개월)`}` : "";
  };
  const parts = list.map((o) => ({ name: o.show || o.label, t: one(o) })).filter((x) => x.t);
  if (parts.length === 1) return `${parts[0].name} 기준 ${parts[0].t} 예상`;
  if (parts.length > 1) return `${parts.map((x) => `${x.name}면 ${x.t}`).join(" · ")} 예상`;
  const dl = String(pkg?.duration_label ?? "").trim();
  return dl ? `예상 기간 ${dl}` : "";
}
function alignPlans(out, rp, packages, freqs) {
  if (!out || typeof out !== "object" || !Array.isArray(out.plans)) return out;
  const list = Array.isArray(packages) ? packages : [];
  const hasRp = rp && typeof rp === "object";
  const r = hasRp ? rp : {};
  const validRef = (n) => Number.isInteger(n) && n >= 0 && n < list.length;
  const find = (snap, ref) => {
    if (snap && typeof snap === "object") {
      const i = snap.id != null ? list.findIndex((p) => p && p.id === snap.id) : -1;
      return i >= 0 ? { i, pkg: list[i] } : (snap.price != null ? { i: null, pkg: snap } : null);
    }
    return validRef(ref) ? { i: ref, pkg: list[ref] } : null;
  };
  const same = (x, y) => Boolean(x && y && ((x.i != null && x.i === y.i) || (x.pkg?.id != null && x.pkg.id === y.pkg?.id)));
  const fix = (plan, hit, recommended) => {
    const pkg = hit?.pkg || null;
    const nm = typeof plan.name === "string" ? plan.name.trim() : "";
    return {
      ...plan, ref: hit ? hit.i : null, recommended,
      name: nm && !/\d/.test(nm) ? nm : (pkg?.name || (recommended ? "추천 코스" : "다른 코스")),
      meta: pkg ? planMeta(pkg, freqs) : "",
      sessions_label: pkg?.sessions ? `함께 ${pkg.sessions}회` : "",
    };
  };
  const plans = out.plans.filter((p) => p && typeof p === "object" && !Array.isArray(p));
  if (!plans.length) return out;
  // 추천 프로그램이 있는데 고른 패키지가 없으면(패키지 없던 때) A에 숫자 · 가격을 붙이지 않는다(화면 resolvePackage와 같은 규칙).
  const a = find(r.pick_pkg, r.pick_ref) || (hasRp ? null : find(null, plans[0].ref));
  let b = find(r.alt_pkg, r.alt_ref);
  if (!b && plans[1] && (a || !hasRp)) b = find(null, plans[1].ref);   // 추천이 정해지지 않았으면 대안도 AI 번호로 붙이지 않는다
  const next = [fix(plans[0], a, true)];
  if (plans[1] && b && !same(a, b)) next.push(fix(plans[1], b, false));
  out.plans = next;
  return out;
}

/* 대본 → 세일즈북 연결(2026-10-13 · 3단계) — 세일즈북이 대본과 다른 약속 · 방향을 만들지 않게, 저장된 대본에서
   '회원에게 보여도 되는 상담 방향'만 뽑아 넘긴다. 서버 이어 만들기(follow)와 화면 다시 만들기가 같은 함수를 쓴다.
   ⚠️ 넘기지 않는 것: 거절 대응 · 요청(ask) · 망설이면 · 기다림 · 회원이 말하게 · 비유 · 30초 요약 · 오늘 안 되면 · 세일즈북 대사 ·
     혜택 · 멈추면 잃는 것 · 과거 케이스 · 더 확인할 점 · 회원 한 줄 · 재등록 숫자(proven · 기간이 섞이지 않게 숫자는 앱 데이터로만). */
function scriptBasis(brief) {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) return null;
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const cs = obj(brief.closing_sequence), wn = obj(brief.why_now), rp = obj(brief.recommended_program);
  const s = (v, n = 200) => (typeof v === "string" ? v.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");
  const out = {
    echo: s(cs.echo),                                    // 회원이 말한 목표 · 고민(되짚기)
    reason: s(cs.stakes, 300),                           // 핵심 상담 근거(왜 지금 · 왜 PT)
    next_goal: s(cs.next_goal) || s(wn.next_roadmap),    // 다음 목표
    direction: s(wn.next_roadmap) && s(cs.next_goal) ? s(wn.next_roadmap) : "",   // 재등록: 앞으로 더 할 것(다음 목표와 다를 때)
    future: s(wn.future_change),                         // 재등록: 앞으로의 그림
    promises: (Array.isArray(cs.promise) ? cs.promise : []).map((p) => s(p)).filter(Boolean).slice(0, 3),
    pick_why: s(rp.why_fit, 300),
    alt_why: s(rp.alt_why, 300),
  };
  return Object.values(out).some((v) => (Array.isArray(v) ? v.length : v)) ? out : null;
}
function basisBlock(b) {
  if (!b) return "";
  const line = (k, v) => (v ? `\n ${k}: ${v}` : "");
  return `\n\n[★대본과 같은 상담 방향 — 트레이너가 이번 상담에서 말할 것(트레이너용 대본에서 뽑음)]${line("회원이 말한 목표 · 고민", b.echo)}${line("핵심 근거", b.reason)}${line("다음 목표", b.next_goal)}${line("앞으로 더 할 것", b.direction)}${line("앞으로의 그림", b.future)}${b.promises.length ? `\n 트레이너의 관리 약속: ${b.promises.map((p, i) => `${i + 1}) ${p}`).join(" ")}` : ""}${line("추천 이유", b.pick_why)}${line("대안 이유", b.alt_why)}
 ★세일즈북은 이 방향과 같아야 한다 — 목표 장은 위 목표 · 고민, 로드맵(또는 '앞으로') 첫 단계는 위 다음 목표와 같은 쪽으로,
   closing.services 앞쪽과 vow는 위 관리 약속과 같은 내용으로(새 약속 · 다른 관리 방식을 만들지 마라 · 나머지 services는 일반 서비스),
   plans[0].why는 추천 이유, plans[1].why는 대안 이유와 같은 쪽으로.
 ★대본 문장을 그대로 옮기지 마라. 회원에게 보여 줄 짧은 문장으로 다시 쓴다. 핵심 근거의 손실 · 압박 표현은 빼고 목표 쪽으로만 쓴다.`;
}
// 화면에서 다시 만드는 세일즈북 — 저장된 대본을 트레이너 본인 토큰으로 읽는다(RLS = 클라 저장과 같은 권한 · 남의 센터 회원은 0행).
//   ⚠️ 이 세일즈북의 회원(memberId)과 같은 회원의 대본만 — 다른 회원 번호 · 다른 회원 계약이면 null(4단계 · 2026-10-13).
/* 저장 대상 확인(2026-10-13) — save가 있으면 그 저장 대상이 요청 회원(memberId) 것이어야 한다. 트레이너 본인 토큰으로 읽는다(RLS · 관리자 키 아님).
   kind ot = save.memberId가 요청 회원과 같고, 그 회원이 이 트레이너에게 보이는 회원(다른 센터 · 없는 회원 = 0행)
   kind contract = 그 계약이 요청 회원의 계약(같은 센터의 다른 회원 계약 · 다른 센터 · 없는 계약 = 0행)
   save가 없으면 저장할 게 없으니 통과 · 모르는 kind는 거절. DB 연결 정보가 없으면(데모) 저장도 못 하니 통과. */
/* 인바디 — 2차 이상 OT 대본 · 2차 세일즈북의 선택 근거(2026-10-13 · AI 새 호출 없음 · lib/inbodyBrief).
   화면이 보낸 report 안의 분석은 쓰지 않는다. 로그인한 트레이너 토큰으로 이 회원의 측정(inbody_log)과 1차 행 분석을 서버가 직접 읽는다
   (RLS = 같은 센터 · user_id = 요청 회원만). 못 읽으면 인바디 없이(예전과 같은 프롬프트). */
// ★인바디를 외부 AI(Anthropic)에 보내는 스위치 — 지금은 끔(2026-10-13 대표 결정 D안).
//   이유: 개인정보 동의서의 'AI 처리' · 개인정보처리방침의 '국외 이전'에 인바디가 아직 적혀 있지 않다.
//   문구를 정비하고 동의 기준을 정하면 true로 바꾼다(요약 lib/inbodyBrief · 블록 inbodyPromptBlock · 서버 읽기 · 동의 확인은 그대로 둠).
//   꺼져 있어도 '이 회원에게 인바디 기록이 있는지'(있다 · 없다)는 세일즈북 서비스 문구에만 쓴다 — 수치 · 분석은 보내지 않는다.
const INBODY_TO_AI = false;
async function loadInbodyRaw(token, memberId, { withAnalysis = true } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !token || typeof memberId !== "string" || !memberId) return null;
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const [ibRes, r1Res] = await Promise.all([
    sb.from("inbody_log").select("*").eq("user_id", memberId).order("measured_at", { ascending: false }).order("created_at", { ascending: false }).limit(2),
    withAnalysis ? sb.from("ot_log").select("report").eq("user_id", memberId).eq("ot_round", 1).order("created_at", { ascending: false }).limit(1) : { data: [], error: null },
  ]);
  if (ibRes.error) return null;
  const analysis = r1Res.error ? null : r1Res.data?.[0]?.report?.inbody_analysis || null;
  return { rows: (ibRes.data || []).filter((x) => x?.user_id == null || x.user_id === memberId), analysis };
}
// 인바디는 건강정보 성격 — 동의를 철회했거나(기존 판정과 같은 질의: 최근 건강정보 동의 기록이 '철회') 확인이 안 되면 AI에 보내지 않는다.
//   (기존 fetchHealthWithdrawn은 조회 실패를 '철회 아님'으로 본다 · 인바디는 더 보수적으로 · 동의 기록이 아예 없는 회원은 기존 판정처럼 '철회 아님')
async function healthBlockedForInbody(token, memberId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !token || typeof memberId !== "string" || !memberId) return true;
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.from("member_consent").select("agreed")
    .eq("member_id", memberId).eq("kind", "health").order("created_at", { ascending: false }).limit(1);
  if (error) return true;
  return data?.[0]?.agreed === false;
}
const ibVal = (v) => (v.unit === "lv" ? `${v.label} 레벨 ${v.value}` : `${v.label} ${v.value}${v.unit}`);
function inbodyPromptBlock(ib, kind = "script") {
  if (!ib || !Array.isArray(ib.values) || !ib.values.length) return "";
  const nums = ib.values.map((v) => `${ibVal(v)}${v.prev != null ? `(이전 ${v.unit === "lv" ? v.prev : `${v.prev}${v.unit}`})` : ""}`).join(", ");
  const rd = ib.read;
  const readLine = rd ? `
 1차 때 회원에게 보여 준 앱 분석(참고 해석 · 확정된 사실이나 의학적 판단이 아니다):${rd.headline ? ` 요약="${rd.headline}"` : ""}${rd.points.length ? ` · 지표 해석: ${rd.points.map((x) => `${x.label}=${[x.state, x.meaning].filter(Boolean).join(" / ")}`).join("; ")}` : ""}${rd.exercise.length ? ` · 운동 방향: ${rd.exercise.join("; ")}` : ""}${rd.why_now ? ` · 종합: ${rd.why_now}` : ""}` : "";
  const where = kind === "book"
    ? `   쓴다면 '당신의 목표' body · '함께 확인한 것' diagnosis의 근거 · 로드맵 how의 관리 방향 중 어울리는 곳에만(새 장을 만들지 마라 · 모든 장에 넣지 마라).
   회원 화면에 수치를 쓰면 '지난 OT 인바디(○월 ○일)'처럼 측정일을 말로 붙인다.`
    : `   쓴다면 흐름은 목표 → 이 관리 포인트 → 1차 관찰 → 필요한 운동 능력 → 앞으로의 관리. stakes · next_goal · plan_pitch 중 한두 곳이면 충분하다.`;
  return `

[인바디 — 선택 근거 · 쓸 때만]
 실제 측정(${ib.measured_at} · 사실${ib.prev_at ? ` · 괄호는 ${ib.prev_at} 측정` : ""}): ${nums}${readLine}
 ★인바디는 보조 근거다. 회원 목표 · 상담 내용 · 1차 OT 관찰이 먼저이고, 그쪽 근거가 더 중요하면 그것을 앞세워라.
   목표와 직접 관련 있고 운동 방향에 도움이 될 때만 관리 포인트를 1~2개 골라 써라(안 써도 된다 · 개수를 채우지 마라 · 관련 없는 지표는 쓰지 마라).
${where}
   운동 계획이나 판매 논리를 인바디에 맞춰 바꾸지 마라. 수치는 위 값 그대로(새 숫자 금지), 앱 해석은 '지난번 같이 본 분석' 정도로만 · 사실처럼 단정하지 마라.
   인바디 수치로 숨참 · 통증 같은 증상의 원인을 단정하지 마라(예: 기초대사량이 낮아서 숨이 찬다 ❌).
   분석을 길게 읽어 주거나 운동마다 되풀이하지 마라. 식단 관리 · 홈케어 같은 서비스를 새로 약속하지 마라.`;
}

// 1차 관찰(+ 2차 이후 관찰)에 적힌 동작 이름 — 세일즈북 '함께 확인한 것' 전후 짝 확인용.
function obsMoveNames(report, history) {
  const pick = (r) => (Array.isArray(r?.movements) ? r.movements : []).map((m) => (m && typeof m === "object" ? m.name : null)).filter((n) => typeof n === "string" && n.trim());
  return [...pick(report), ...(Array.isArray(history) ? history : []).flatMap((h) => pick(h?.observation))];
}

async function saveTargetOk(token, save, memberId) {
  if (save == null) return true;
  if (typeof save !== "object" || Array.isArray(save)) return false;
  if (typeof memberId !== "string" || !memberId) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return true;
  if (!token) return false;
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  if (save.kind === "ot") {
    if (save.memberId !== memberId) return false;
    const { data, error } = await sb.from("user_table").select("id").eq("id", memberId).maybeSingle();
    return !error && Boolean(data?.id);
  }
  if (save.kind === "contract") {
    if (typeof save.contractId !== "string" || !save.contractId) return false;
    const { data, error } = await sb.from("session_log").select("id").eq("id", save.contractId).eq("user_id", memberId).maybeSingle();
    return !error && Boolean(data?.id);
  }
  return false;
}

async function loadSavedScript(token, ref, memberId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !token || !ref || typeof ref !== "object" || typeof memberId !== "string" || !memberId) return null;
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  if (ref.kind === "ot" && ref.memberId === memberId) {
    const round = Math.min(Math.max(Number(ref.round) || 2, 2), 20);
    const { data } = await sb.from("ot_log").select("report").eq("user_id", memberId).eq("ot_round", round).order("created_at", { ascending: false }).limit(1);
    return data?.[0]?.report?.brief || null;
  }
  if (ref.kind === "contract" && typeof ref.contractId === "string") {
    const { data } = await sb.from("session_log").select("report").eq("id", ref.contractId).eq("user_id", memberId).maybeSingle();
    return data?.report?.reg_brief || null;
  }
  return null;
}
/* 이번 계약 기간을 서버가 기록에서 다시 계산(2026-10-13 · B+C) — 화면이 보낸 regPeriod · ptContext.this_period는 쓰지 않는다.
   트레이너 본인 토큰(RLS)으로 이 회원의 계약 · 그 계약 일지(끝까지 페이지) · 인바디를 읽고 lib/regPeriod contractPeriod(화면과 같은 계산).
   반환: { ok:true, round, period(첫 재등록이면 null) } | { ok:false } — 조회 실패 · 이 회원 계약이 아님은 ok:false(0회로 보지 않는다). */
async function loadContractPeriod(token, memberId, contractId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !token || typeof memberId !== "string" || !memberId || typeof contractId !== "string" || !contractId) return { ok: false };
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: contracts, error: e1 } = await fetchAllRows(() => sb.from("session_log").select("*").eq("user_id", memberId));
  if (e1 || !Array.isArray(contracts) || !contracts.some((c) => c && c.id === contractId)) return { ok: false };
  const { data: logs, error: e2 } = await fetchAllRows(() => sb.from("daily_workout_log").select("*").eq("user_id", memberId).eq("contract_id", contractId));
  if (e2 || !Array.isArray(logs)) return { ok: false };
  const { data: ib, error: e3 } = await fetchAllRows(() => sb.from("inbody_log").select("*").eq("user_id", memberId));
  if (e3 || !Array.isArray(ib)) return { ok: false };
  // 화면은 측정일 오래된 순으로 읽는다(fetchAllRows는 id 순) — 같은 순서로.
  const inbodyRows = [...ib].sort((a, b) => String(a.measured_at ?? "").localeCompare(String(b.measured_at ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  const res = contractPeriod({ contracts, logs, inbodyRows, contractId });
  return res ? { ok: true, round: res.round, period: res.period } : { ok: false };
}

// 이번 계약 기간 숫자 — 회원이 보는 세일즈북에 쓰이니 모양 · 범위를 한 번 더 확인한다(서버 계산값에도 마지막 안전장치). 이상하면 그 칸을 버린다(4단계).
function cleanPeriod(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const round = Number(p.round);
  if (!Number.isInteger(round) || round < 2 || round > 50) return null;
  const num = (v) => ((typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) && Math.abs(Number(v)) < 10000 ? Math.round(Number(v) * 10) / 10 : null);
  const txt = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const sd = Number(p.sessions_done);
  const rows = (arr, map) => (Array.isArray(arr) ? arr.slice(0, 8).map(map).filter(Boolean) : []);
  return {
    round,
    started: typeof p.started === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.started) ? p.started : null,
    sessions_done: Number.isInteger(sd) && sd >= 0 && sd <= 10000 ? sd : null,
    inbody_change: rows(p.inbody_change, (x) => { const lb = txt(x?.label, 20), f = num(x?.first), l = num(x?.latest); return lb && f != null && l != null ? { label: lb, first: f, latest: l, unit: txt(x?.unit, 6) } : null; }),
    weight_change: rows(p.weight_change, (x) => { const ex = txt(x?.exercise, 30), f = num(x?.first), l = num(x?.latest); return ex && f != null && l != null ? { exercise: ex, first: f, latest: l } : null; }),
  };
}
// 두 번째 이상 재등록 세일즈북 — 표(앱 숫자) = 누적, 이번 계약 기간 숫자는 따로(화면이 계산해 보낸 this_period). 없으면 "".
function regPeriodBlock(p) {
  if (!p || typeof p !== "object" || !(Number(p.round) >= 2)) return "";
  const list = (arr, f) => (Array.isArray(arr) && arr.length ? arr.slice(0, 8).map(f).join(", ") : "없음");
  return `\n\n[★${Number(p.round)}번째 재등록 — 기간을 나눠 써라]
 · 표(앱이 그리는 숫자)와 [그동안의 변화 요약] = 처음 시작한 날부터 지금까지 '누적'이다.
 · 이번 계약 기간(${g(p.started)}부터 · 지난 재등록 이후): 진행 수업=${p.sessions_done != null ? `${p.sessions_done}회` : "없음"} · 인바디=${list(p.inbody_change, (x) => `${x.label} ${x.first}→${x.latest}${x.unit || ""}`)} · 운동 무게=${list(p.weight_change, (x) => `${x.exercise} ${x.first}→${x.latest}kg`)}
 · 다음 계약에서 할 것 = [대본과 같은 상담 방향]의 다음 목표(없으면 roadmap의 다음 단계).
 ★journey · change.caption에서 두 기간의 숫자를 섞지 마라. 누적은 '처음 시작한 날부터', 이번 기간은 '지난 재등록 이후'라고 분명히 밝혀라.
   이번 기간 숫자는 위 값만 쓰고, '없음'이면 이번 기간 변화를 말하지 마라(숫자 · 변화를 만들지 마라).`;
}

/* 2차 세일즈북 사진 장 안전망(2026-10-13) — AI는 사진을 보지 않는다(이름표만). 그런데도 변화를 단정하는 말이 나오면
   중립 문장으로 바꾸고 그런 포인트는 뺀다. 사진이 없으면 '다음에 함께 남겨요'. 프롬프트 규칙과 같은 방향(이중 방어). */
const PHOTO_CLAIM = /달라졌|달라진\s*게\s*보|좋아졌|변했|개선됐|개선되었|나아졌|확\s*달라|눈에\s*띄게|효과가\s*보|(펴|빠|줄|늘|커|작아|가벼워|얇아|올라|내려|탄탄해|날씬해|슬림해|선명해|곧아)졌|바르게\s*(됐|되었)/;
function neutralPhotoSlide(out, photoLabels) {
  const ps = out && typeof out === "object" ? out.photo_slide : null;
  if (!ps || typeof ps !== "object") return out;
  const has = Array.isArray(photoLabels) && photoLabels.some(Boolean);
  const within = ps.mode === "within_session";
  if (PHOTO_CLAIM.test(String(ps.title || ""))) ps.title = within ? "사진으로 함께 비교해 봐요" : "지금을 시작점으로 남겨요";
  if (PHOTO_CLAIM.test(String(ps.body || ""))) {
    ps.body = has ? "사진을 나란히 두고 어디가 어떻게 보이는지 같이 이야기해 봐요."
      : "사진은 다음에 함께 남겨요. 시작점을 기록해 두면 나중에 같이 비교할 수 있어요.";
  }
  if (Array.isArray(ps.points)) ps.points = ps.points.filter((p) => !PHOTO_CLAIM.test(String(p || "")));
  return out;
}

/* 가격 비교(2026-10-13) — 실제 저장된 가격으로 패키지마다 총 결제 금액 · 회당 금액이 목록에서 어디쯤인지. 금액 숫자는 내보내지 않는다.
   2차 세일즈북 프롬프트(말로 넘김)와 아래 안전망(검사)이 같은 함수를 쓴다. 가격이 2개 미만이면 비교 없음. */
function priceRanks(pkgs) {
  const list = Array.isArray(pkgs) ? pkgs : [];
  const tot = list.map((p) => { const v = Number(p?.price); return Number.isFinite(v) && v > 0 ? v : null; });
  const per = list.map((p, i) => { const s = Number(p?.sessions); return tot[i] != null && Number.isFinite(s) && s > 0 ? Math.round(tot[i] / s) : null; });
  const rank = (arr, i) => {
    const xs = arr.filter((v) => v != null);
    if (xs.length < 2 || arr[i] == null) return null;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return lo === hi ? "same" : arr[i] === lo ? "low" : arr[i] === hi ? "high" : "mid";
  };
  return list.map((_, i) => ({ total: rank(tot, i), per: rank(per, i) }));
}
function priceCompare(pkgs) {
  const W = { same: "모두 같음", low: "가장 낮음", high: "가장 높음", mid: "중간" };
  return priceRanks(pkgs).map((r) => [r.total && `총 결제 금액 ${W[r.total]}`, r.per && `회당 금액 ${W[r.per]}`].filter(Boolean).join(" · "));
}

/* 2차 세일즈북 약속 · 가격 안전망(2026-10-13) — 회원이 직접 보는 장이라 프롬프트 규칙과 같은 방향으로 한 번 더 거른다(이중 방어).
   ① 플랜 설명의 가격 말: '총액이 가장 낮다'가 사실이 아니면 회당이 가장 낮을 땐 '회당 금액이 가장 낮아요'로, 아니면 그 문장을 뺀다.
      '회당이 가장 낮다'가 사실이 아니어도 그 문장을 뺀다. 상품을 못 찾으면(확인 불가) 가격 문장을 뺀다.
   ② 대본의 관리 약속에 없는 수업 밖 서비스(홈케어 · 사진 · 식단 · 카톡 · 인바디 기록이 없는 회원의 인바디)는 포함 항목 · 제공 서비스에서 뺀다 → 빈자리는 앱이 늘 하는 것으로.
   ③ 다짐의 '○○까지 책임' → '등록하신 기간 동안 책임' · 결과 보장 문장 · 다짐의 성격을 설명하는 문장('등록 권유가 아니라' 류)은 뺀다. ④ '회원 전용 공간' → '회원 전용 페이지'. */
const SB_LOW_TOTAL = /(?:한\s*번에\s*(?:드는|내는|나가는|드시는)\s*(?:부담|비용|금액|돈)|총\s*(?:결제\s*)?(?:금액|비용|부담)|전체\s*(?:금액|비용|부담))\s*[이가은는도]?\s*(?:가장\s*|제일\s*)?(낮|적|싸|저렴|가볍|가벼)([가-힣]*)/;
const SB_LOW_PER = /회당\s*(?:금액|가격|비용|부담)?\s*[이가은는도]?\s*(?:가장\s*|제일\s*)?(?:낮|적|싸|저렴|가볍|가벼)/;
const SB_EXTRA = [/홈\s*케어/, /사진|비포|애프터/, /식단/, /카톡|카카오톡|메신저/];
// 앱이 늘 하는 것(빈자리 채움) — 인바디 변화는 이 회원에게 실제 인바디 기록이 있을 때만(2026-10-13 · 인바디를 안 재는 트레이너도 있다).
const sbStandard = (hasInbody) => [["운동일지", "매 수업 운동일지를 남기고 회원님이 직접 확인"], ["회원 전용 페이지", hasInbody ? "회원 전용 페이지에서 운동 기록과 인바디 변화 확인" : "회원 전용 페이지에서 운동 기록과 무게 변화 확인"]];
const SB_VOW_UNTIL = /까지\s*(?:꼭\s*|반드시\s*)?책임/;
const SB_PLAN_MEMO = /센터\s*규정|규정을?\s*확인|기간\s*처리|기간을?\s*연장|연장해\s*드|예외로\s*처리/;   // 트레이너용 기간 메모가 회원 플랜 설명에 새어 나온 문장 · 2026-10-13
const sbNoForce = (t) => (typeof t === "string" ? t.replace(/(?:꼭|반드시)\s+(?=(?:다시\s*잡|보강))/g, "") : t);   // 일정 재조정 · 보강의 '꼭 · 반드시'만 뺀다
const SB_VOW_META = /권유가?\s*아니|하겠다는\s*약속|약속이에요|다짐합니다|다짐이에요/;   // 다짐의 성격을 설명하는 문장(지시문이 새어 나온 것) · 2026-10-13
const SB_GUARANTEE = /보장|반드시\s*[가-힣\s]{0,12}(?:드릴|만들어|이뤄|이루어)|꼭\s*(?:빼|이뤄|이루어|만들어|달성)[가-힣]*\s*드릴|달성(?:해|시켜)\s*드릴/;
const sbSentences = (t) => String(t || "").split(/(?<=[.!?])\s+/).filter((s) => s.trim());
function sbLowEnding(stem, e) {
  let x = e || "";
  if (stem === "저렴") x = x.replace(/^해/, "아").replace(/^한/, "은").replace(/^하/, "");
  else if (stem === "가벼") x = x.replace(/^워/, "아").replace(/^운/, "은");
  else if (stem === "싸") x = /^[요서]/.test(x) ? `아${x}` : x;
  else x = x.replace(/^어/, "아");
  return x || "아요";
}
// '함께 확인한 것' 전후 짝(2026-10-13) — before · after가 1차 기록의 서로 다른 동작을 가리키면(이름으로 확인될 때만) 교정 전후가 아니므로 after를 비운다.
//   동작 이름을 못 찾으면(짧게 줄여 쓴 경우 등) 건드리지 않는다 · 프롬프트 규칙이 먼저 막는다.
const sbFlat = (t) => String(t || "").replace(/\s+/g, "");
function sbMovesIn(text, moves) {
  const t = sbFlat(text);
  return new Set(moves.filter((n) => n && t.includes(n)));
}
function guardSalesbook(out, packages, basis, { hasInbody = false, moves = [] } = {}) {
  if (!out || typeof out !== "object") return out;
  const cf = out.confirmed && typeof out.confirmed === "object" ? out.confirmed : null;
  const names = [...new Set((Array.isArray(moves) ? moves : []).map(sbFlat).filter((n) => n.length >= 2))];
  if (cf && names.length && typeof cf.before === "string" && typeof cf.after === "string" && cf.before.trim() && cf.after.trim()) {
    const b = sbMovesIn(cf.before, names), a = sbMovesIn(cf.after, names);
    if (b.size && a.size && ![...a].some((n) => b.has(n))) out.confirmed = { ...cf, after: "" };
  }
  const ranks = priceRanks(packages);
  if (Array.isArray(out.plans)) {
    out.plans = out.plans.map((pl) => {
      if (!pl || typeof pl !== "object" || typeof pl.why !== "string") return pl;
      const r = Number.isInteger(pl.ref) && pl.pkg ? ranks[pl.ref] : null;
      const totalLow = r?.total === "low" || r?.total === "same";
      const perLow = r?.per === "low" || r?.per === "same";
      const why = sbSentences(pl.why).map((s) => {
        const m = s.match(SB_LOW_TOTAL);
        if (m && !totalLow) return perLow ? s.replace(m[0], `회당 금액이 가장 낮${sbLowEnding(m[1], m[2])}`) : null;
        if (!m && SB_LOW_PER.test(s) && !perLow) return null;
        if (SB_PLAN_MEMO.test(s)) return null;
        return s;
      }).filter(Boolean).join(" ");
      return { ...pl, why };
    });
  }
  const promised = Array.isArray(basis?.promises) ? basis.promises.join(" ") : "";
  const extra = hasInbody ? SB_EXTRA : [...SB_EXTRA, /인바디|체성분/];
  const keep = (t) => !extra.some((re) => re.test(String(t || "")) && !re.test(promised));
  const refill = (arr) => {
    if (!Array.isArray(arr)) return arr;
    const kept = arr.filter(keep);
    for (const [key, line] of sbStandard(hasInbody)) if (kept.length < arr.length && !kept.some((t) => String(t).includes(key))) kept.push(line);
    return kept;
  };
  if (Array.isArray(out.plans)) out.plans = out.plans.map((pl) => (pl && typeof pl === "object" && Array.isArray(pl.includes) ? { ...pl, includes: refill(pl.includes) } : pl));
  if (out.closing && typeof out.closing === "object") {
    if (Array.isArray(out.closing.services)) out.closing.services = refill(out.closing.services).map(sbNoForce);
    if (typeof out.closing.vow === "string") out.closing.vow = sbNoForce(out.closing.vow);
    if (typeof out.closing.vow === "string" && out.closing.vow.trim()) {
      const vow = sbSentences(out.closing.vow).map((s) => {
        const m = s.match(SB_VOW_UNTIL);
        if (m) {
          const start = s.lastIndexOf(",", m.index) + 1;
          return `${s.slice(0, start)}${start ? " " : ""}등록하신 기간 동안 책임${s.slice(m.index + m[0].length)}`;
        }
        return SB_GUARANTEE.test(s) || SB_VOW_META.test(s) ? null : s;
      }).filter(Boolean).join(" ");
      out.closing.vow = vow || "등록하신 기간 동안 매 수업 정성껏 곁에서 도울게요.";
    }
  }
  const term = (v) => (typeof v === "string" ? v.replace(/회원\s*전용\s*공간/g, "회원 전용 페이지")
    : Array.isArray(v) ? v.map(term) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, term(x)])) : v);
  return term(out);
}

function firstPrompt(member, packages, favorites) {
  const m = member || {};
  const has = (v) => v != null && !['', '-', '없음', '미설정'].includes(String(v).trim()); // 빈 칸은 "-"로 저장되기도 한다
  // 방문 목적(있을 때만) — 목적에 따라 '오늘 등록' 블록 · 클로징 요청의 세기가 바뀐다.
  const purposeKey = typeof m.ot_purpose === "string" && OT_PURPOSE_GUIDE[m.ot_purpose] ? m.ot_purpose : null;
  const purpose = purposeKey ? { ...OT_PURPOSE_GUIDE[purposeKey], label: OT_PURPOSE_OPTS.find(([v]) => v === purposeKey)?.[1] || "" } : null;
  const soft = Boolean(purpose?.soft);
  const purposeBlock = purpose ? `
[★오늘 OT 방문 목적 — 회원이 신청서에서 고름: "${purpose.label}"] 운동 목표(goal)와 별개의 정보다. 목표는 '무엇을 바꾸고 싶은지', 이건 '오늘 OT에서 무엇을 얻고 싶은지'다.
 - ${purpose.guide}
 - 이 목적은 오늘 수업에서 반드시 충분히 채워라(회원이 '원하던 걸 얻었다'고 느끼게). opening의 ⓒ 오늘 흐름 안내에 이 목적을 넣어라("오늘 ○○ 궁금하다고 하셔서, ~" 결).
 - 방문 목적만으로 PT 구매 의사를 단정하지 마라(살 생각이 있다고도, 없다고도). 운동 중 회원 반응 · 효과는 아직 관찰 전이니 지어내지 말고 가설 톤으로.
 - cheat ①(이 회원)에는 이 방문 목적이 드러나게 써라.
` : "";
  const goalTodayBlock = soft ? `[★1차 OT의 흐름 = 방문 목적을 채우고 → 확인한 개인별 필요로 상담에 잇기] 이 회원은 PT 등록을 생각하고 온 게 아닐 수 있다.
갑자기 등록을 요청하는 대본 금지. 순서: 방문 목적을 충분히 채운다 → 운동하며 확인할 이 회원만의 필요(혼자서는 어려운 지점)를
짚는다 → 그 필요를 근거로 맞는 방법(추천 플랜 · 비용)을 소개하고 같이 해 볼지 부드럽게 묻는다. 회원이 관심을 보이면 그 자리에서
플랜 · 비용까지 분명히 설명하고 등록을 제안해도 된다. 원하지 않으면 붙잡지 말고 다음 연결(다음 OT · 다음 방문)을 안내한다.
'다음에 천천히 생각해 보세요'로 흐지부지 끝내지는 마라.` : `[★1차 OT의 목표 = 오늘 PT 등록 (대표 지침 · 못박음)] 1차라고 '맛보기·관계 쌓기'로 끝내지 마라. 오늘 수업의
끝은 등록 요청이다 — 세 스텝 전부가 그 요청을 받기 위한 빌드업이다. '다음에 천천히 생각해 보세요'로 미루는
대사 금지. 오늘 등록이 안 되면 다음 OT를 가까운 날로 잡는 것이 차선이다(날짜·시간은 회원에게 묻는다).`;
  const sparse = !has(m.goal) && !has(m.job);
  // 목표도 직업도 없으면 개인 맞춤 근거·비유를 만들 재료가 없다 → 지어내지 말고 수업 중에 회원에게서 얻게 한다(2026-10-02).
  const sparseBlock = sparse ? `
[★정보가 거의 없는 회원 — 목표도 직업도 입력되지 않았다] 근거·비유를 지어내지 마라. 대신 수업 중에 회원에게서 재료를 얻는다.
 - opening.line 끝에 목표를 묻는 질문 한 마디를 꼭 넣어라("오늘 운동하시면서 제일 바뀌었으면 하는 게 뭐예요?" 결).
 - stakes·plan_pitch·ask에서 회원 목표가 들어갈 자리는 ○○로 비워 둬라(트레이너가 회원이 한 말을 넣어 말한다).
 - 비유는 [비유 재료 찾는 순서]의 ⑤ 누구나 겪어본 일상 하나만, 어색하면 생략. fill_in: true를 JSON에 넣어라.
 - cheat ①은 "아직 목표를 모르는 분 · 첫마디에서 목표부터 듣기" 결로.
` : "";
  // OT 신청서에서 회원이 안 적은 것(2026-10-06) — 첫 5분에 자연스럽게 물을 질문으로 메운다(목표는 위 sparse 규칙이 따로 다룸).
  const unknown = [!has(m.weekly_freq) && "일주일에 몇 번 운동할 수 있는지", !has(m.exercise_level) && "운동 경험",
    !has(m.quit_reason) && "예전에 그만둔 이유", !m.health_screen && !has(m.pain) && "운동 전 알아야 할 건강 상태(불편한 곳 · 질환)"].filter(Boolean);
  const unknownBlock = unknown.length ? `[아직 모르는 것 — 회원이 신청서에 안 적음] ${unknown.join(" · ")}
 - opening.line의 ⓑ(가볍게 묻는 한마디)를 이 중 가장 중요한 것 하나로 써라(질문 나열 금지 · 최대 1개).
 - 나머지는 ② 운동 4칸의 '몸 상태 체크' 칸 how·feel에 대화로 묻는 한마디로 녹여라(설문처럼 묻지 말 것).
 - 모르는 칸을 짐작해서 사실처럼 쓰지 마라(예: 주 3회 가능하다고 단정 금지 → 추천 빈도는 '권하는' 말투로).
` : "";
  const machines = Array.isArray(m.machines) ? m.machines.join(", ") : g(m.machines);
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  // 회차 ÷ 주당 횟수 = 걸리는 기간(2026-10-13 · AI가 '주 2회 × 3개월 = 30회'처럼 거꾸로 계산하던 것) — 계산은 앱이(lib/pkgPace ·
  //   대본 화면 가격 줄 아래 안내와 같은 계산), AI는 이 숫자만 쓴다. 기간을 넘겨도 '못 쓰는 상품'이 아니라 '센터 확인이 필요한 상품'으로 적는다.
  const freq = weeklyNum(m.weekly_freq);
  const pace = (p) => paceText(p, paceFreqs(freq));
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) => {
        const per = p.sessions ? Math.round(p.price / p.sessions) : null;
        return `[${i}] name=${g(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g(p.duration_label)} · price=${Number(p.price).toLocaleString("ko-KR")}원${per ? ` · 회당=${per.toLocaleString("ko-KR")}원` : ""}${p.note ? ` · note=${p.note}` : ""}${pace(p)}`;
      }).join("\n")
    : "등록된 패키지 없음";
  const favBlock = favoritesBlock(favorites);
  return `[상황·대전제] 1차 OT 입장 3분 전. 이 출력의 목적 = 회원이 신청한 목적을 채우면서, 자연스럽고 분명한 PT 상담 · 등록 제안을 준비하는 것이다(제안의 세기는 아래 1차 OT 흐름 블록을 따른다).
트레이너는 이걸 30초~1분에 훑어 머리에 넣고 폰을 주머니에 넣는다. '참고 설명'이 아니라 '바로 외워
바로 말할 완성 대사'로 써라. 추상 지침·개발자용 매핑 설명 금지.
OT는 [① 인사·라포 → ② 운동(그 자리에서 차이를 느껴 볼 수 있게) → ③ 클로징] 3스텝으로 흐른다 — 그 순서대로, 각 스텝 핵심만 짧게.

${sparseBlock}
${goalTodayBlock}

${BEFORE_CLASS_RULE}
[이 국면 특칙 — 대본 수위] 세일즈(오프닝·비유·클로징·거절)뿐 아니라 운동 파트도 '회원에게 그대로 말할
실제 대사'까지 구체적으로 준다. 단 아래는 여전히 절대 금지:
 - 숫자 처방(세트·횟수·각도·중량·템포·시간). 운동은 '방향 + 짚어줄 말'까지, 숫자는 빼라.
 - 의료 단정(치료·완치·진단). 통증은 '불편/부담' 표현이 기본 · 클로징 stakes에서만 '전보다 통증이 더 심해질 수도 있어요'처럼 가능성 표현 허용(진단 · 단정 금지).

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, residence=${g(m.residence)},
               mbti=${g(m.mbti)}, gender=${g(m.gender)}, pain=${g(m.pain)}, goal=${g(m.goal)}, machines=${machines}
[OT 사전 문진 — 회원이 등록 때 작성(있는 것만 활용, 없으면 무시)]
 목표시점/계기=${g(m.goal_deadline)}, 원하는페이스=${g(m.training_pace)}, 부상·수술=${g(m.injury_history)},
 운동경험=${g(m.exercise_level)}, 예전중단이유=${g(m.quit_reason)}, 받아본유료운동=${g(m.past_exercise)},
 가능빈도·시간=${g(m.availability)}, 하루활동량=${g(m.activity_level)}, 바라는점=${g(m.member_note)},
 일주일에가능=${m.weekly_freq ? `주 ${m.weekly_freq}번` : "없음"}, 건강체크=${healthLine(m.health_screen)}, 알게된경로=${g(m.lead_source)}
${purposeBlock}${unknownBlock}아직 관찰 전이다 — 신체 판단은 '~일 가능성' 가설 톤. 없는 관찰·수치·에피소드 창작 금지. 단 오프닝·
비유·거절 대사는 세일즈 기술이라 확신 있게 완성해도 된다(사실 왜곡이 아니므로).

[내 PT 패키지] (★이 목록에서만 추천. 없는 패키지·가격·세션수 창작 금지. [n]=참조번호)
${pkgBlock}
[내 즐겨찾기 운동자료] (트레이너가 별표한 자기 자료 — 상황에 맞으면 아래 exercises에서 '우선' 골라 lib_ref로 참조. [fn]=자료번호)
${favBlock}

[★운동목적(goal) = 최우선 렌즈] goal이 3스텝 전부의 중심축이다.
 - 통증개선/불편해소 → 불편 부위를 전면, 그 해소로 엮는다.
 - 외형/체중감량/바디라인 → 체형·라인·자신감을 전면, pain은 보조.
 - 건강/체력/활력 → 컨디션·에너지를 전면.  - 벌크업/근육 → 근성장·볼륨·자세를 전면.
 ⚠️ goal과 무관하게 pain만 물지 말 것. pain은 goal이 통증개선일 때만 주인공.

[사전 문진 활용 — 클로징 근거 강화]
 - goal_deadline(시점): 추천 빈도 · 기간 판단과 '왜 지금'에 최우선 반영("목표 날짜까지 약 N주라, 주 2~3회면 이 회차를 기간 안에 쓸 수 있어요" 결 · 숫자는 '진행 계산(앱)'대로 · '필수' 같은 강요 표현 금지). 없으면 일반 기간 논리.
 - availability(가능 빈도): recommended_program.frequency의 현실 빈도 근거로, 목표에 부족하면 그 격차를 objection_defense의 time(시간부족) 선제 방어로 연결.
 - quit_reason(예전 중단 이유): objection_defense.doubt와 클로징 손실 프레이밍의 직접 근거("혼자 하다 ○○로 멈추셨잖아요. 이번엔 그 지점을 제가 잡아드려요"). 없는 이유 창작 금지.
 - injury_history·exercise_level·activity_level: target_exercise 동작 선택·난이도·안전(부상 부위 우회)과 비유 소재로. injury_history 있으면 의료경계 유지.
 - training_pace·member_note: 오프닝·전반 톤 보조(있을 때만).

[PT 관심도 — 추천 회차의 크기와 제안 톤에만 반영] 회원이 직접 밝힌 것만 신호로 쓴다: 방문 목적(PT 수업과 비용 · 맞춤 계획이면 높음) ·
 원하는 페이스('제대로' · '집중해서') · 목표 시점 · 가능 빈도 · 받아본 유료 운동(PT 방식에 익숙한지로만 · 돈 문제로 읽지 마라).
 - 관심도가 분명히 높으면: 목표까지 가는 계획에 맞는 회차를 분명하게 제안한다.
 - 관심도가 낮거나 아직 모르면: 첫 단계(자세 · 습관 · 기구 사용이 자리 잡는 데 필요한 만큼)부터 제안하고, 다음 단계는 그때 같이 정하자고 말한다.
 - ★직업 · 나이 · 거주지로 지불 여력이나 소득을 짐작하지 마라. 회원에게 돈 · 여유를 언급하는 말도 금지.

[컨닝페이퍼 3스텝 — 트레이너가 읽는 순서 = OT 진행 순서]

① opening(입장 첫마디 · 첫 5분): ★장면 = 회원이 이미 운동하러 와 있고(센터 · 스튜디오) 트레이너가 처음 맞이하는 순간이다.
   그 자리에서 그대로 할 말을 이 순서로 2~3문장: ⓐ 반가운 인사와 자기소개 ⓑ 직업·거주·목표 같은 일상 소재로
   가볍게 묻는 한마디 ⓒ 오늘 흐름 안내 한 줄("오늘은 몸 상태 먼저 보고, 운동 몇 가지 해본 다음에 앉아서
   회원님한테 맞는 방법 같이 정해볼게요" 결). ⓒ는 끝의 클로징이 갑자기 꺼내는 얘기로 느껴지지 않게 미리 깔아 두는 말이다.
   ★"편하게 오세요/오시면 돼요/부담 갖지 마세요"처럼 오기 전이나 전화로 할 말은 금지(이미 와 있다).
   ★자기소개는 이름 없이("오늘 함께할 트레이너예요" 결) — 트레이너 이름을 모르니 ○○로 비우지 마라(○○은 회원 목표 빈칸 전용).
   세일즈 냄새 0, 사람 대 사람의 라포.
   - line: 그대로 말할 첫 대사("○○님, …") 2~3문장.  - why: 이게 여는 것(긴장 완화·신뢰·흐름 예고) 1문장.

② 오늘 운동(★이 스텝이 핵심 · 4칸 구성): 이 회원 goal·pain·기본정보(관찰 전 가설)에서 아래 4칸으로 짠다.
     ① 몸 상태 체크: goal·pain과 이어지는 기본 움직임을 시켜 지금 상태를 함께 보는 동작(평가 겸 기준점 ·
        마지막 비교의 '처음'). 운동이 아니라 체크로 소개한다.
     ② 메인 동작: 회원 목표의 핵심 움직임을 '배워야 제대로 되는' 동작으로. 오늘 수업의 중심.
     ③ 목표 부위 자극: 센터 장비·프리웨이트로 목표 부위를 확실히 느끼게 하는 동작(세팅·큐가 있어야 자극 위치가 달라지는 것).
     ④ 처음과 비교: ①을 다시 해서 달라졌는지 회원이 직접 확인(질문으로 · 오늘의 핵심 비교). 처음과 비교하기 쉬운 동작이어야 한다.
   목적별 결: 재활·교정이면 굳은 데를 풀어 그날 가벼워지는 기능성 동작 위주, 체형·근력이면 타겟 부위 직접 자극,
   경험자면 익숙한 것 말고 색다른 자극. 뻔한 일반동작(숄더프레스·체스트프레스류) 반복 금지.
${EXERCISE_BAR}
   [내 즐겨찾기 운동자료]가 상황에 맞으면 그걸 '우선' 골라 lib_ref로 참조하라.
   숫자 처방(세트·횟수·각도·중량·템포) 금지. 무엇을·어떤 방향으로·왜인지까지만.
${SAMEDAY_PROOF}
${REHAB_TONE}
   먼저 workout_structure(트레이너가 읽는 한 줄): 오늘 4칸 구성을 이 회원 기준으로 요약("자세 체크 → 루마니안
   데드리프트 → 힙 쓰러스트 → 다시 체크" 결).
   workout_intro(회원에게 말할 대사): "오늘은 ○○·△△ 해볼 거예요. ~하려고요"처럼 오늘 할 운동들을 소개하며
   '왜 이걸 하는지'를 한 번에 납득시키는 완성 대사 1~2문장.
   exercises[] = 위 4칸 순서대로 정확히 4개. 각 항목:
   - slot: "몸 상태 체크" | "메인 동작" | "목표 부위 자극" | "처음과 비교" 중 하나.
   - name: 콕 집은 구체 동작 이름만(15자 안팎 · 하는 방법을 붙이지 마라).
   - how: 어떻게 하는지 한 문장(숫자 없이 · 트레이너가 읽는 설명).
   - reason: ★"회원님은 이 운동을 ~ 때문에 하셔야 해요"를 회원이 이해하도록 풀어주는 이유(이 회원 goal·pain
     기반, 전문용어 없이). ★이게 이 블록의 핵심 — '혼자선 못 잡는다'는 의존 심기보다, 회원이 '왜 이 운동이
     나한테 필요한지' 스스로 납득하게 하는 '교육형' 설명. 확신 있되 부담 없이.
   - feel: 이 동작에서 노리는 자극 · 느낌 한 줄(트레이너가 확인할 기준 · "~가 느껴질 수 있어요" 결 · 회원이 이미 느꼈다고 쓰지 마라).
   - cue: 그 순간 그대로 말할 대사 한 문장. 짧은 동작 안내 뒤에 회원이 느낀 걸 직접 말하게 하는 질문으로 끝낸다
     ("발을 조금만 앞으로 옮겨 볼게요. 아까보다 어디에 힘이 들어가는 느낌이세요?" 결). '~죠'로 체감을 확정하지 마라. 압박 아님.
   - proof: '처음과 비교'는 true, 메인 동작도 차이가 극적이면 true, 나머지 false.
   - lib_ref: 위 [내 즐겨찾기 운동자료]에서 쓴 자료 번호(정수). 안 썼으면 null.
   - alts: 같은 칸에 바꿔 끼울 참고 운동 2개(기구가 차 있거나 회원 상태가 다를 때). 각 {name: 동작 이름, why: 왜 이
     회원에게 맞는지 한 줄, feel: 바로 느낄 것 한 줄}. 같은 기준(쉬운 동작 금지)을 지켜라. '몸 상태 체크'·'처음과 비교'
     칸은 빈 배열이어도 된다.
   그리고 so_what(exercises 밖): 4개를 묶어 'PT를 받는 게 낫겠다'는 회원 스스로의 결론 한 줄(사실 기반·압박 아님 · 회원이 무엇을
   느꼈다고 단정하지 말고, 오늘 같이 맞춰 본 과정과 그게 왜 혼자서는 어려운지로).

③ 클로징 — 운동 끝나고 다시 앉아서. 아래 셋으로 자연히 닫는다.

 sales_metaphor(세일즈 비유 — 선택 · 어울릴 때만 · 요청에는 넣지 않는다): 회원 세계에서 끌어온 비유 하나로 '지금
   안 하면/함께 하면'을 그림처럼. 운동·기계 클리셰("브레이크-액셀") 금지.
${METAPHOR_RULE}
   - metaphor: 비유 한 문장(없으면 "").  - bridge: 비유→등록 필요성으로 잇는 한 줄.

${closingSeqInstruction({
    num: "",
    echoHint: `신청서 · 문진에 적은 목표나 바라는 점${purpose ? " · 방문 목적" : ""}(오늘 회원 반응은 아직 모르니 반응을 지어내지 마라).`,
    trialHint: "오늘 비교해 본 동작에서 어떤 차이가 있었는지 묻는다 — 차이를 느꼈다고 전제하지 말고 '차이가 없어도 괜찮아요'를 붙인다(예: \"두 동작을 비교해 보니 어떤 차이가 있었나요? 차이가 없어도 괜찮아요.\").",
    nextHint: "PT를 시작하면 첫 한 달 동안 트레이너가 할 일과 그때 같이 확인할 것 한 가지(결과는 보장하지 말고 '~를 목표로' · 숫자 약속 금지 · 자세나 체감이 달라질 거라고 전제하지 말고 '실제로 차이가 있는지 같이 확인해요' 결).",
    gainHint: "이어서 그 플랜으로 트레이너가 해 줄 관리 한 문장(예: 운동 순서를 정리해 드리고 직접 연습하도록 도와요 · '혼자 할 수 있게 돼요' · 살이 빠져요 같은 결과를 확정하지 마라).",
    askHint: soft
      ? "★이 회원은 PT를 생각하고 온 게 아닐 수 있다. 다만 이 ask는 회원이 상담에 관심을 보였을 때 하는 요청이다 — 추천 플랜(빈도 · 기간 또는 총 회차)을 담아 분명하게 등록을 제안하되(확인형), 결제를 재촉하지 마라. PT 구매 의사를 미리 확정하지도, 제안을 아예 빼지도 마라."
      : "★1차 OT의 목표는 오늘 등록이다 — 오늘 결정을 부드럽게 묻는다('생각해 보세요'로 미루지 않는다).",
    fallback: true,
    tone: soft
      ? " ★방문 목적을 먼저 채운 뒤 상담으로 잇는다. trial_close로 회원의 관심을 열고, stakes · plan_pitch는 신청서 정보와 오늘 같이 해 볼 것에서만(회원 반응 단정 금지). ask는 분명하되 재촉하지 않고, 흐지부지 끝내지 않는다. 물러서면 flush에서 무엇이 걸리는지 묻고, 원하지 않으면 붙잡지 말고 fallback으로 다음 연결을 안내한다. 대본은 한 갈래로 쓴다(수업 중 앱을 보거나 고르게 하지 않는다)."
      : " ★1차도 오늘 등록 요청까지 간다. ask는 '생각해 보세요'로 미루지 않고 오늘 결정을 묻는다. 물러서면 flush에서 진짜 이유를 꺼내고, 그래도 안 되면 다음 OT를 가까운 날로 잡는다(날짜는 회원에게 묻는다).",
  })}

 objection_defense(거절 선제 방어 5종): 아래 5개 각각 미리 무장. 반박이 아니라 '공감으로 빗장 풀고
   세일즈로 다시 끌기'. reason 키 고정(5개 전부 · 각 1개):
     price(가격 부담) · hesitation(생각해볼게요·망설임) · doubt(효과·필요성 의심) ·
     time(시간 부족·바빠서) · compare(타 센터 비교 — "가격 비교하고 올게요/다른 데서도 OT 받아볼게요").
   - trigger: 이 거절이 나올 신호(회원이 흔히 하는 말) 1문장.
   - defense: 공감으로 걱정 풀고 바로 잇는 세일즈 무브 1~2문장.
   - line: 그 자리에서 그대로 말할 실제 대사("○○님, …") 1문장.
   ⚠️ compare는 경쟁사 비방·가격 맞대응 금지 → '오늘 같이 한 것'이라는 관계·데이터 선점 우위로
     ("다른 데선 처음부터 다시 보셔야 해요. 저는 오늘 ○○님 ○○ 동작을 같이 봤고요" 결 · 어떤 감각 · 결과까지 봤다고 단정하지 말 것).
   ⚠️ 허위 긴급성·공포·죄책감 금지(PREAMBLE 상속).

[recommended_program — 추천 프로그램 + '왜 이 횟수' 근거] 위 [내 PT 패키지]에서 이 회원에게 맞는 1개(pick_ref)를 골라라.
   클로징 직전에 회원에게 회차를 제시할 때 쓸, 반박 안 되는 근거를 만드는 블록이다.
   ★고르는 순서:
     ① 먼저 목표 · 운동 경험 · 방문 목적 · [PT 관심도]로 '처음에 필요한 양'을 정한다. 목표 시점이 있으면 그 날짜에서 거꾸로,
        없으면 첫 단계(자세 · 습관 · 기구 사용이 자리 잡는 데 필요한 만큼)에 맞춘다.
     ② 회원 빈도로 하면 얼마나 걸리는지는 '진행 계산(앱)'으로 본다. 예상 기간은 참고일 뿐, 패키지를 키우는 이유가 아니다.
     ③ 예상 기간에 맞추려고 더 큰 패키지로 올리지 마라. 가격 순서(가장 비싼 · 가장 싼)를 기본값으로 삼지 마라. PT 구매 의사가
        확인되지 않은 회원에게 큰 패키지를 기본으로 권하지 말고, 반대로 무조건 가장 작은 패키지로 물러서지도 마라.
   ★계산: 회차 · 빈도 · 기간은 '진행 계산(앱)' 숫자만 써라. 빈도 × 기간으로 회차를 거꾸로 맞추지 마라(주 2회로 3개월이면 약 26회
     전후다. 30회가 아니다). frequency · duration · session_logic · plan_pitch · ask · cheat의 숫자는 모두 같아야 한다.
${DURATION_MEANING}
   - why_fit: 이 패키지가 이 회원에게 맞는 이유(목표 · 운동 경험 · 방문 목적 · 불편 · 가능 빈도). 2문장 이내. 직업으로 지불 여력을 짐작하지 마라.
   - frequency: 권장 주간 빈도(예: "주 2회")와 '왜 그 빈도인지' 근거(회복시간 확보·습관형성 최소빈도·
     목표 속도 등 회원 상황 기반). 1문장.
   - duration: 권장 총 기간과 '왜 그 기간인지' 근거. 기간 숫자는 '진행 계산(앱)'과 같게. 1문장.
   - session_logic: pick_ref 패키지의 회차를 회원 빈도로 하면 얼마나 걸리는지 '진행 계산(앱)' 숫자로 한 줄
     (예: "주 2회면 50회는 약 25주(약 6개월) 예상이에요" / "주 2회면 30회는 약 15주(약 3.5개월) 예상이에요").
     ★세션수는 네가 고른 pick_ref 패키지의 실제 sessions 값 그대로(새 숫자 창작 금지). ★단 '가격(원)'은 값 텍스트에 절대 쓰지 마라 — 금액은 앱이 목록에서 채운다.
     ※ 패키지가 '기간제'(세션수 없음)면 session_logic은 '왜 이 기간이 필요한지'로 대체한다.
   - alt_ref: 추천과 반대 방향(한 단계 가볍거나 무거운) 대안 1개(마땅찮으면 null). alt_why 2문장 이내 · 그 대안의 예상 진행 기간도 '진행 계산(앱)'대로 정직하게.
   - 패키지 없으면 pick_ref=null + data_gaps에 "가격 설정 탭에 패키지를 등록하면 콕 집어드려요".

[data_gaps — 성장 프레임] 기본정보로 위 전부를 반드시 생성한다("정보 부족" 반환 금지). data_gaps는 결핍이
   아니라 "○○를 관찰해오면 △△까지" 형태 긍정 코칭. 충실하면 빈 배열.

[cheat — 30초 요약 3줄 · 화면 맨 위 · 화면이 줄마다 '이 회원 / 오늘 꼭 / 요청' 이름을 붙인다] 바빠서 이것만 보고 들어가도 되게.
 ① 이 회원: 한 문장으로 사람을 그려라("연말 검진 전에 8kg 빼고 싶은데, 허리 다칠까 봐 운동이 겁나는 분" 결). ★단어·명사 나열 금지("34세 개발자, 8kg 감량, 운동 겁과 허리 뻐근함" ❌).
 ② 오늘 꼭: 오늘 수업에서 반드시 할 한 가지를 동사로 끝나는 짧은 문장으로("숙이기를 처음과 끝에 시켜 달라진 걸 직접 느끼게 하기" 결).
 ③ 요청: ${soft
    ? `방문 목적을 채운 뒤 상담으로 잇는 한마디(따옴표 · 40자 안팎 · 질문형). ★패키지 횟수 · 가격 · 등록이라는 말을 넣지 마라
    ("오늘 배운 기구로 살 빠지는 순서까지 같이 짜 볼까요?" 결). 횟수 · 가격이 담긴 분명한 제안은 클로징 ask에 둔다.`
    : "클로징 ask를 그대로 짧게(따옴표 · 40자 안팎)."}
 각 40자 안팎. 아래 항목과 같은 내용을 짧게 압축(새 내용 창작 금지).
[분량 — 외우기 쉽게] 각 대사는 짧고 입에 붙게. 아래 [대사 스타일]의 분량을 지켜라.
[필드명 인용 금지] 값 텍스트에 스키마 키(point_it_out·so_what·objection_defense 등)를 쓰지 마라.
${MEMBER_LANG}
${SAY_STYLE}
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명 노출 금지. 아래 JSON만(설명·마크다운·코드펜스 금지). ★data_gaps를 포함한 모든 값 텍스트는 반드시 한국어 문장으로만. 영어 단어·문장 절대 금지.
{
  "cheat": ["회원 핵심 한 줄", "오늘 꼭 할 것 한 줄", "클로징 한 마디(대사)"],
  "member_read": "이 회원 한 줄: 누구고/뭘 원하고/뭐가 걸리나 (3분전 각인 앵커)",
  "opening": { "line": "...", "why": "..." },
  "workout_structure": "오늘 4칸 구성 한 줄",
  "workout_intro": "오늘 할 운동들을 회원에게 소개 + 왜 하는지 납득시키는 대사",
  "exercises": [ { "slot": "몸 상태 체크", "name": "...", "how": "...", "reason": "...", "feel": "...", "cue": "...", "proof": false, "lib_ref": null, "alts": [] }, { "slot": "메인 동작", "name": "...", "how": "...", "reason": "...", "feel": "...", "cue": "...", "proof": true, "lib_ref": null, "alts": [ { "name": "...", "why": "...", "feel": "..." }, { "name": "...", "why": "...", "feel": "..." } ] }, { "slot": "목표 부위 자극", "name": "...", "how": "...", "reason": "...", "feel": "...", "cue": "...", "proof": false, "lib_ref": null, "alts": [ { "name": "...", "why": "...", "feel": "..." }, { "name": "...", "why": "...", "feel": "..." } ] }, { "slot": "처음과 비교", "name": "...", "how": "...", "reason": "...", "feel": "...", "cue": "...", "proof": true, "lib_ref": null, "alts": [] } ],
  "so_what": "...",
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  ${CLOSING_SEQ_JSON_OT},
  "objection_defense": [ { "reason": "price|hesitation|doubt|time|compare", "trigger": "...", "defense": "...", "line": "..." } ],
  "recommended_program": { "pick_ref": 0, "why_fit": "...", "frequency": "...", "duration": "...", "session_logic": "...", "alt_ref": null, "alt_why": "" },
  "data_gaps": ["..."]
}
※ exercises는 4칸 순서대로 정확히 4개(각 proof 불린·lib_ref 정수 또는 null·alts 배열). objection_defense는 위 5개 reason을 각각 1개씩(총 5). pick_ref/alt_ref는 정수 또는 null.`;
}

// ③ phase="second" user 프롬프트
// D-3: cases(내 과거 클로징 케이스)가 있을 때만 case 입력블록·case_feedback 스키마를 additive로 삽입.
//      cases 없거나 빈 배열이면 지금과 바이트 동일한 프롬프트(회귀 안전 제1원칙).
const RESULT_KO = { success: "등록", hold: "보류", fail: "실패", none: "결과 미기록" };
const REASON_KO = { money: "가격 부담", time: "시간 부족", schedule: "일정", consider: "생각해볼게요", compare: "다른 곳 비교", partner: "가족·배우자 상의", personal: "개인 사정" };
function secondPrompt(member, report, cases = [], caseTier = "tentative", packages = [], round = 2, history = [], favorites = [], inbody = null) {
  const m = member || {};
  const r = report || {};
  const n = Number.isInteger(round) && round >= 2 ? round : 2;
  const hist = Array.isArray(history) ? history.filter(Boolean) : [];
  // 이전 차수 대본이 권한 패키지(2026-10-13 · 화면 buildHistory가 저장된 스냅샷에서 이름 · 회차 · 기간만) — 있으면 참고 · 바꾸면 이유.
  const pickTxt = (pp) => {
    if (!pp || typeof pp !== "object" || typeof pp.name !== "string" || !pp.name.trim()) return "";
    const bits = [Number(pp.sessions) > 0 ? `${Number(pp.sessions)}회` : "", typeof pp.duration_label === "string" ? pp.duration_label.slice(0, 30) : ""].filter(Boolean).join(" · ");
    return `${pp.name.slice(0, 40)}${bits ? `(${bits})` : ""}`;
  };
  const hasPrevPick = hist.some((h) => pickTxt(h.prev_pick));
  // 클로징 우선 모드 — 바로 앞 차수에서 등록 제안을 했는데 안 됐거나(보류), 제안조차 못 했으면 이번 OT의 1순위는 등록.
  const lastH = hist.length ? hist[hist.length - 1] : null;
  const lastReason = lastH?.closing_reason ? (REASON_KO[lastH.closing_reason] || lastH.closing_reason) : "";
  const closingFirst = !lastH || lastH.closing_result === "success" || lastH.closing_result === "fail" ? ""
    : lastH.proposed
      ? `
[★클로징 우선 모드 — ${lastH.round}차에서 등록을 제안했지만 보류됨] 이번 OT의 1순위는 등록 마무리다.
 (a) cheat 첫 줄 = "지난번 망설인 이유(${lastReason || "회원이 말한 걸림돌"}) → 오늘 이렇게 푼다" 한 줄.
 (b) session_plan은 3개 이내로 줄이고, 지난 피드백에서 '다음 OT에서 다시 보여주기'로 표시된 장면을 다시 보여주는 데 집중.
 (c) 클로징을 수업 후반이 아니라 중반에 연다(증명 직후 바로 trial_close).
 (d) objection_defense는 그 망설인 이유를 맨 앞에, 가장 구체적으로.`
      : `
[★이번엔 반드시 등록 제안까지 — ${lastH.round}차에서 제안을 못 했음] 이번 OT의 끝은 등록 요청이다. ask를 분명히 하고,
 물러서면 flush로 진짜 이유를 꺼내라. cheat 셋째 줄은 그대로 말할 요청 대사.`;
  const historyBlock = hist.length
    ? `
[이전 OT 기록 — 차수별 결과·사유${n > 2 ? "·2차 이후 관찰" : ""}] (트레이너가 실제 남긴 기록 · 창작 금지)
${hist.map((h) => `${h.round}차: 결과=${RESULT_KO[h.closing_result] || "결과 미기록"} · 등록 제안=${h.proposed ? "함" : "못 함"}${h.closing_reason ? ` · 사유=${REASON_KO[h.closing_reason] || h.closing_reason}` : ""}${h.closing_detail ? ` · 클로징 메모=${JSON.stringify(h.closing_detail)}` : ""}${h.observation ? ` · 관찰=${JSON.stringify(h.observation)}` : ""}${pickTxt(h.prev_pick) ? ` · 그때 권한 패키지=${pickTxt(h.prev_pick)}` : ""}${h.prev_read ? ` · 지난 리포트 요지=${h.prev_read}` : ""}`).join("\n")}
${n > 2 ? `★이번은 ${n}차 — 앞 차수에서 등록이 미뤄진 이유(사유·회원 반응)를 정면으로 풀어라. 앞에서 쓴 증명·대사를 그대로 반복하지 말고, 이번에 새로 확인시킬 것을 골라라.` : "★1차 결과·사유가 있으면 그 걸림돌을 오늘 증명과 클로징에서 먼저 풀어라."}${closingFirst}
`
    : "";
  const g2 = (v) => (v == null || v === "" ? "없음" : v);
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  // 진행 계산(2026-10-13) — 신청서 주당 횟수 + 주 1 · 2 · 3회(회원이 나중에 다르게 말한 빈도로도 계산이 있게) · lib/pkgPace.
  const freq2 = weeklyNum(m.weekly_freq);
  const freqOpts2 = freqOptions({ applied: freq2 });
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) => {
        const per = p.sessions ? Math.round(p.price / p.sessions) : null;
        return `[${i}] name=${g2(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g2(p.duration_label)} · price=${Number(p.price).toLocaleString("ko-KR")}원${per ? ` · 회당=${per.toLocaleString("ko-KR")}원` : ""}${p.note ? ` · note=${p.note}` : ""}${paceText(p, freqOpts2)}`;
      }).join("\n")
    : "등록된 패키지 없음";
  const validCases = Array.isArray(cases) ? cases.filter(Boolean) : [];
  const hasCases = validCases.length > 0;
  const tierLabel = caseTier === "confident" ? "뚜렷" : "잠정(케이스 아직 적음)";
  const caseInputBlock = hasCases
    ? `
[내 과거 클로징 케이스 — 이 트레이너 본인 것만 · 경향 신뢰도=${tierLabel}] (거울: 비슷한 프로파일에
통한/막힌 접근을 근거로 이번 리딩을 돕는다. 대사 이식 금지 · 압박≠강조.)
${validCases.map((c, i) => `${i + 1}. [${c.result}] 프로파일=${JSON.stringify(c.profile)} · 접근=${c.detail?.approach ?? c.approach ?? "-"} · 반응=${c.detail?.reaction ?? "-"} · 결과=${c.detail?.outcome ?? c.reason ?? "-"}`).join("\n")}
`
    : "";
  const caseSchemaLine = hasCases
    ? `,
  "case_feedback": { "diagnosis": "과거 케이스에 비춘 이 회원의 진짜 장애물(표면 아닌 근본)", "proven_lead": "비슷한 프로파일에 통한 접근 기반, 회원이 욕구를 자기 말로 꺼내게 할 리딩 방향", "avoid_repeat": "과거 막힌 벡터 있으면 '이번엔 그거 말고 X' + 왜(없으면 null)", "your_read": "트레이너에게 되묻는 넛지 1문장" }`
    : "";
  return `[상황·대전제] ${n}차 OT 입장 3분 전. 목적 = 지난 OT의 반응과 망설인 이유를 바탕으로 필요한 상담을 이어 가, 분명한 등록 제안까지 준비하는 것. 1차와 달리
아래 '1차 관찰'이라는 실제 근거가 있다 — 이번엔 '증명'으로 클로징을 확실히 닫는다. 트레이너가 30초에
훑어 외우고 폰을 넣는 컨닝페이퍼니, 바로 말할 완성 대사로.

[이 국면 특칙 — 대본 수위] 세일즈·운동 모두 '그대로 말할 실제 대사'까지. 단 숫자 처방(세트·횟수·각도·
중량·템포)과 의료 단정(치료·완치·진단)은 절대 금지.

${BEFORE_CLASS_RULE}[★${n}차 대본 — 지난 기록과 이번 수업을 나눠 써라]
 - 아래 [1차 관찰 기록] · [이전 OT 기록]은 이미 있었던 일(트레이너가 실제로 남긴 기록)이다. 기록에 있는 것만 '지난번 ~하셨죠' 처럼 지난 일로 말해도 된다.
 - 이번 ${n}차 수업에서 할 운동과 회원이 느낄 것은 아직 모른다. 예정('오늘은 ~해 볼게요')과 질문('어떠세요?')으로만 써라.
 - 증명 동작에서 회원이 차이를 못 느낀다고 해도 실패가 아니다. 그대로 인정하고 다른 큐로 자연스럽게 이어 가게 써라.

[회원 기본정보] name=${g2(m.name)}, age=${g2(m.age)}, job=${g2(m.job)}, mbti=${g2(m.mbti)}, gender=${g2(m.gender)}, pain=${g2(m.pain)}, goal=${g2(m.goal)}
[회원이 신청서에 적은 일정 — 처음 정보 · 아래 [★최신 상담 기록 우선]] 일주일에가능=${freq2 ? `주 ${m.weekly_freq}번` : "없음"}, 가능시간=${g2(m.availability)}, 목표시점=${g2(m.goal_deadline)}

[1차 관찰 기록 — 유일 근거(가설 아님, 트레이너가 실제 관찰)]
${JSON.stringify({
    movements: r.movements ?? [],
    reaction: r.reaction ?? {},
    goal: r.goal ?? {},
    memberQuote: r.memberQuote ?? "",
    trainer_note: r.trainer_note ?? "",
    sales_intensity: r.sales_intensity ?? "standard",
  }, null, 2)}
${historyBlock}${caseInputBlock}
이 1차 관찰${hist.length ? "과 이전 OT 기록" : ""}을 근거로 ${n}차를 설계하라. 없는 관찰·수치·에피소드 창작 금지. ⚠️위 [1차 관찰]의 JSON 키(movements·reaction·memo·stimulus·attitudeTags·goal 등)는 내부 라벨이다 — 값 텍스트·대사에 그 영어 단어를 절대 쓰지 마라. 한국어로 풀어라("관찰된 동작에서…", "메모에 적으신…").

[내 PT 패키지] (★이 목록에서만 추천. 없는 패키지·가격·세션수 창작 금지. [n]=참조번호)
${pkgBlock}

[등록 제안 수위 — sales_intensity · 트레이너가 지난 피드백에서 '이번 OT용'으로 정한 값] 압박의 세기가 아니라
요청을 얼마나 분명히·일찍 하느냐다. soft=가볍게 떠보기(체감 위주, 요청은 부드러운 가정형) / standard=분명하게
제안(정석 흐름으로 ask까지) / strong=오늘 꼭 마무리(클로징을 수업 중반에 열고, 망설인 이유를 먼저 풀고, ask를
분명히 + flush로 재요청까지). 어느 쪽이든 허위 긴급성·공포·죄책감 금지.

[목표 → 운동 방향 — 최종 목표를 모든 문장에 붙이지 마라]
 - goal은 회원의 최종 목표다. 먼저 이 목표에 필요한 운동 능력을 이 회원에 맞게 1~3개 정하라(예: 계단을 편하게 오르기 → 심폐지구력 ·
   하체 근력 · 근지구력, 필요하면 코어 안정성 / 목표가 '기구 사용법'처럼 배우기 자체면 그 기구를 제대로 쓰는 세팅 · 자세 · 힘 쓰는 감각).
   개수 · 종류를 고정하지 말고, 목표와 관련 없는 능력을 끼워 넣지 마라.
 - 회원이 말한 목표를 높이거나 새 기준(층수 · 숫자 · '쉬지 않고' 같은 말)으로 확정하지 마라(cheat · plan_pitch · ask 포함).
   더 구체적인 목표는 '회원님과 같이 정해요' 결로 남긴다.
 - 운동의 이유(session_plan의 point · proof)는 그 동작이 쓰는 근육 · 움직임 · 체력과 키우는 능력으로 설명하라. 최종 목표 문구(계단 · 숨참 · 살 같은 말)를
   운동마다 되풀이하지 마라. 목표와의 연결은 echo · stakes · next_goal · plan_pitch에서 한두 번이면 충분하다.
 - 1차 관찰 기록에 있는 상태와 아직 확인하지 않은 것을 나눠라. 오늘 수업은 아직 확인하지 않은 것 중 무엇을 볼지 고르는 자리다.
 - 숨참 · 통증 같은 증상의 원인을 근력 부족 등 하나로 단정하지 마라. 관찰한 움직임 과제(무릎 정렬 · 근력 등)는 그 동작의 과제일 뿐이다.
   증상의 원인처럼 한 문장에 잇지 마라. 운동 중 숨참 · 통증은 운동 능력 문제로 진단하지 말고, 강도는 보수적으로, 필요하면 의료적 확인이 먼저다
   (회원 대사엔 '담당 의사와 먼저 확인해 보시면 좋아요' 한마디까지 · 진단 금지).
 - 숨 · 호흡 반응은 큐 하나로 좋아진다는 기대를 만들지 말고 관찰 · 기록할 대상으로만 써라(증명 동작의 비교 대상으로 쓰지 마라).
 - 상담(stakes · next_goal · plan_pitch)은 '이 목표에 어떤 능력이 필요하고, 트레이너가 그걸 단계적으로 조절 · 기록하며 돕는다'로 잇는다.${inbodyPromptBlock(inbody, "script")}

[컨닝페이퍼 — 2차는 '증명 → 클로징']
① recall(입장 첫마디 · 지난 시간 소환): ★장면 = 회원이 운동하러 와 있고(센터 · 스튜디오) 트레이너가 맞이하는 순간. 1차의 체감·회원
   한마디(memberQuote)를 되살려 문을 열고("지난번 ○○ 느끼셨던 거 기억나세요?" 결 · 기록에 있는 체감 · 한마디만 · 없으면 지난번 같이 한 동작으로), 오늘 흐름 한 줄("오늘은 그거
   이어서 확인해 보고, 끝나고 앉아서 방향 같이 정해요" 결)을 붙인다. "편하게 오세요" 같은 오기 전 말 금지.
   - line: 그대로 말할 대사 2~3문장. - why: 이걸 여는 이유 1문장.

② session_plan(오늘 수업 운동 구성 — '무엇을 시킬지' 구체적으로): 오늘 2차 수업에서 이 회원에게 실제로
   시킬 운동을 순서대로 3~5개 구성하라. 1차 관찰(movements/reaction)·pain과 위 [목표 → 운동 방향]의 운동 능력에서 도출하고, 아래 '증명
   포인트'가 잘 터지도록 빌드업되게 짜라(가벼운 활성·준비 → 핵심 → 증명으로 자연히 이어짐). 이게 트레이너가
   '오늘 뭘 시킬지'를 바로 아는 실전 구성이다.
   ★각 운동은 '이름 있는 구체 동작 + 한 줄 큐/세팅'으로. 고정 구성 반복 금지, 회원 goal·pain으로 개인화.
   숫자 처방(세트·횟수·각도·중량·템포) 금지 — 무엇을·어떤 방향으로·왜인지까지만.
${SAMEDAY_PLAN}
${GENDER_HINT}
${EXERCISE_BAR}
   각 항목: exercise(짧은 동작 이름만 · 15자 안팎 · 세팅을 붙이지 마라) / how(세팅·하는 법 한 문장) / point(왜 시키나: 이 동작이 쓰는 근육 · 움직임 · 키우는 능력, 또는 핵심 큐 1문장)
   / lib_ref(아래 [내 즐겨찾기 운동자료]에서 쓴 자료 번호(정수) · 안 썼으면 null).
   [내 즐겨찾기 운동자료] (트레이너가 별표한 자기 자료 — 이 회원 상황에 맞으면 session_plan · proof에서 '우선' 골라 lib_ref로 참조. [fn]=자료번호)
${favoritesBlock(favorites)}

③ proof(증명 포인트 2개): 위 수업 구성 중/직후, 회원이 차이를 직접 느껴 볼 수 있게 준비한 결정적 순간 2개.
   ★동작은 이 회원에게 필요한 운동 능력·pain·1차 관찰(movements/reaction)에서 도출하라 — 고정 동작 습관 반복 금지,
   직업 비어도 goal·pain으로 개인화, 숫자 처방 금지. 각 동작 before→after 체감 실험으로(먼저 시켜→큐 하나
   잡아줌→어떤지 회원에게 묻기 · 차이가 없을 수도 있다, 그 큐가 혼자선 찾기 어려운 지점).
${SAMEDAY_PROOF}
${REHAB_TONE}
   moves[] 각: exercise(짧은 동작 이름만 · 15자 안팎) / how(어떻게 시켜 비교하는지 한 문장) / target_reaction(노리는 차이 · 트레이너가 확인할 기준 ·
   "~가 느껴질 수 있어요" 결 · 회원이 이미 느꼈다고 쓰지 마라) /
   point_it_out(그 순간 그대로 말할 대사 — 비교해서 어떤지 회원이 자기 말로 말하게 하는 중립 질문으로("비교해 보니 어떤 느낌이세요? 차이가 없으면
   그대로 말씀해 주세요." 결) · 차이를 느꼈다고 전제하는 질문("어디가 달라지셨어요?" · "어떤 점이 달랐나요?") 금지 ·
   '~죠?'로 체감을 확정하지 마라 · 회원이 차이를 말하면 이어서 '그 지점이 혼자서는 찾기 어려운 부분이에요' 결로 잇는다) /
   lib_ref([내 즐겨찾기 운동자료]에서 쓴 자료 번호(정수) · 안 썼으면 null).
   so_what: 두 증명을 묶어 'PT를 받아야 한다'는 회원 스스로의 결론으로 잇는 한 줄(회원이 무엇을 느꼈다고 단정하지 말고, 같이 맞춰 본 과정과 그게 왜 혼자서는 어려운지로).
   if_weak: 회원이 차이를 못 느낀다고 할 때 그대로 인정하고 이어 갈 대사 + 다른 큐 · 조정 하나(숫자 없이·방향만 · 한두 문장).

④ sales_metaphor(선택): 어울릴 때만 회원 세계에서 끌어온 비유 하나(운동·기계 클리셰 금지 · 요청에는 넣지 않는다). metaphor + bridge(등록 필요성으로).
${METAPHOR_RULE}

${closingSeqInstruction({
    num: "⑤",
    echoHint: "1차 관찰의 회원 말(memberQuote) · 진짜 원하는 것 · 지난번 망설인 이유 중 하나.",
    trialHint: "오늘 proof에서 해 본 동작을 콕 집어, 비교해서 어떤지 회원이 자기 말로 말하게 묻는다(차이를 느꼈다고 전제하지 마라 · '어디가 달라지셨어요?' · '어떤 점이 달랐나요?' 금지 · 예: \"방금 두 번 해 보니 어떤 느낌이세요? 차이가 없으면 그대로 말씀해 주세요.\").",
    nextHint: "등록하면 첫 단계에서 키울 운동 능력과 트레이너가 조절 · 기록할 것, 그때 같이 확인할 것(결과 보장 금지 · 숫자 약속 금지 · 세일즈북 로드맵 첫 단계가 이 방향을 따른다).",
    // 차수 구분(2026-10-13 · 4단계) — '마지막 OT급'은 2차에만. 3차부터는 앞 차수에서 미뤄진 이유를 풀었는지 확인하며 같은 요청을 되풀이하지 않는다.
    askHint: n === 2
      ? "★2차는 마지막 OT급 — 1차보다 확신 있게 묻되 강요하지 않는다."
      : `★${n}차 — 앞 차수에서 등록이 미뤄진 이유를 오늘 풀었는지 확인하며 묻는다. 지난번과 같은 요청 문구를 되풀이하지 말고, 확신 있게 하되 회원이 원치 않으면 다음 연결로.`,
    fallback: true,
    tone: n === 2
      ? " ★2차는 1차 관찰이라는 실제 근거가 있는 국면 — trial_close는 오늘 proof에서 회원이 직접 말한 체감을 다시 듣고(지어내지 마라), ask는 1차보다 확신 있게(마지막 OT급)."
      : ` ★${n}차는 이전 OT 기록이라는 실제 근거가 있는 국면 — trial_close는 오늘 proof에서 회원이 직접 말한 체감을 다시 듣고(지어내지 마라), ask는 지난 걸림돌을 푼 뒤에 분명하게(반복 압박 금지).`,
    gainHint: "이어서 그 플랜으로 트레이너가 무엇을 해 주고 무엇을 같이 확인하며 목표로 가는지 한 문장(운동 결과 · 체중 감량을 보장하지 마라 · '~를 목표로 가요' 결).",
  })}

⑤-b ${BOOK_RULE}
   - open: 세일즈북 표지를 펴며 하는 첫마디(오늘 이 회원만 보고 정리했다는 결).
   - cases: '이런 변화를 만들어요'(같은 목표 회원 사례) 장에서 한마디(숫자는 말하지 말고 '회원님과 목표가 같았던 분' 결).
 2차 세일즈북 장 순서: 표지 → 당신의 목표 → 함께 확인한 것(지난 OT 기록) → (사진 · 사례) → 로드맵 → 추천 플랜 → (혜택) → 약속.
 echo는 '목표' 장, trial_close와 stakes는 '확인한 것' 장, next_goal은 '로드맵' 장, plan_pitch는 '추천 플랜' 장, promise와 ask는 마지막 '약속' 장에서 말한다 — 그 장에 맞게 써라.

⑥ objection_defense(거절 선제 방어 5종): price·hesitation·doubt·time·compare 각 1개. 1차 관찰·(있으면)
   회원 quit_reason을 근거로 더 날카롭게. 각: trigger(나올 신호) / defense(공감+세일즈 무브) /
   line(그대로 말할 대사). ⚠️compare는 경쟁사 비방 금지→'지난 OT부터 같이 확인해 온 기록' 데이터 선점 우위(기록에 있는 것만 · 오늘 반응은 단정하지 마라).
   ⚠️허위 긴급성·공포·죄책감 금지.
   ⚠️일정 변경 · 보강은 확정해 약속하지 마라("그 주 안에 꼭 다시 잡아 드릴게요" ❌) — "센터 규정과 예약 가능한 시간을 확인해서 다시 잡아 드릴게요" 결
     (promise · objection_defense · flush · fallback 공통).

[recommended_program — 추천 프로그램 + '왜 이 횟수' 근거] 위 [내 PT 패키지]에서 이 회원에게 맞는
   1개(pick_ref)를 확신 있게 골라라. 2차는 1차 관찰로 '증명'까지 끝낸 국면이라, '왜 이 횟수가 맞는지' 반박 안 되는 근거를 만든다.
${laterPickRule("1차 관찰 · 목표 · 일정(주당 가능 횟수 · 가능 시간 · 목표 시점 · 신청서보다 그 뒤 회원이 직접 말한 최신 내용이 우선)으로 처음에 필요한 양을 정한다. 목표 시점이 있으면 그 날짜에서 거꾸로.")}
   ★최신 상담 기록 우선 — 신청서는 처음에 적은 정보다. [이전 OT 기록](클로징 메모 · 사유 · 회원 반응) · [1차 관찰 기록](회원이 한 말 · 메모)에서
     회원이 그 뒤 분명하게 다르게 말한 항목은 그 말이 우선이다: 주당 가능 횟수 · 가능 시간 · 가격 부담 · 목표 변화 · 등록을 미룬 이유.
     최신 말이 없는 항목은 신청서를 그대로 쓴다(신청서를 통째로 버리지 마라).
     최신 말이 분명하면 frequency · duration · session_logic · weekly · plan_pitch · ask · cheat · objection_defense가 모두 그 말과 같아야 한다
     (예: "일주일에 한 번밖에 시간이 안 나요"가 기록에 있으면 주 1회로 실행할 수 있는 계획 · 주 2회를 권하지 마라). 회차는 그 조건과 목표로 다시 판단하되
     특정 회차를 정해 두지 마라. 회원 말을 넘어서는 일정(주 2회 · 특정 요일)을 권하려면 '되시면 좋다'는 선택으로만 · 회원에게 묻는 말로.
     기록끼리 다르고 최신 의사가 분명하지 않으면 AI가 정하지 마라: weekly=null · 요청에서 '일주일에 몇 번 되시는지'를 먼저 묻고 ·
     data_gaps 첫 줄에 두 기록을 나란히 적어 트레이너가 확인하게 하라. 회원이 말하지 않은 일정 · 목표를 만들지 마라.${hasPrevPick ? `
   ★이전 차수에서 권한 패키지가 있다([이전 OT 기록]의 '그때 권한 패키지'). 이번 정보로 다시 확인해서, 맞으면 이어 가고(회원이 같은 말을 들어야 믿는다)
     바꾸면 why_fit 첫 문장에 이유를 적어라 — 이유는 회원 목표 · 일정 · 지난 반응 · 망설인 이유 같은 실제 기록이어야 한다.
     이전 추천을 확인 없이 그대로 두지도, 이유 없이 더 큰 패키지로 바꾸지도 마라.` : ""}
   ★추천 근거 = 회원 목표 · 1차 관찰 · 필요한 관리 기간 · 주당 가능 횟수 · 가격 · 시간 부담을 함께 본다. 특정 회차를 기본값으로 삼지 마라.
     '예상 기간에 딱 맞는다' · '필요한 빈도가 가장 낮다'는 추천 이유가 아니다(why_fit · plan_pitch · ask에 이유로 쓰지 마라).
     더 큰 회차를 고르면 회원 상태와 관리 계획에서 그만큼이 필요한 구체적 이유를 적어라. [이전 OT 기록]의 망설인 이유가 시간 · 가격이면
     그 부담을 무시하지 말고, 더 작은 대안과 견줘 어떻게 고려했는지 why_fit에 한 줄로 적어라.
   - why_fit: 이 패키지가 이 회원에게 맞는 이유(목적·불편·1차 관찰). 2문장 이내.
   - frequency: 권장 주간 빈도와 '왜 그 빈도인지' 근거. 1문장.
   - duration: 권장 총 기간과 '왜 그 기간인지' 근거. 기간 숫자는 '진행 계산(앱)'과 같게. 1문장.
   - session_logic: pick_ref 패키지의 회차를 그 빈도로 하면 얼마나 걸리는지 '진행 계산(앱)' 숫자로 한 줄(예상 진행 기간으로).
     ★세션수는 pick_ref 패키지의 실제 sessions 값 그대로(새 숫자 창작 금지). ★'가격(원)'은 값 텍스트에
     절대 쓰지 마라 — 금액은 앱이 목록에서 채운다. ※기간제(세션수 없음)면 '왜 이 기간'으로 대체.
   - weekly: frequency에서 권한 주당 횟수 숫자 하나('진행 계산(앱)'에 있는 빈도 중 하나 · 예 1). 세일즈북 플랜 장의 예상 기간을 앱이 이 숫자로 계산한다.
     frequency · duration · session_logic · plan_pitch · ask의 빈도와 같아야 한다. 주당 횟수가 기록끼리 엇갈리고 최신 의사가 분명하지 않으면 null.
   - alt_ref: 결이 다른 대안 1개(마땅찮으면 null), alt_why 2문장 이내 · 그 대안의 예상 진행 기간도 '진행 계산(앱)'대로 정직하게.
   - 패키지 없으면 pick_ref=null + data_gaps에 "가격 설정 탭에 패키지를 등록하면 콕 집어드려요".
   ★가격 부담 신호(1차 관찰·quit_reason·trainer_note에 '비싸다/부담' 류)가 있으면 why_fit·session_logic에서
     '왜 이 투자가 합리적인지'(혼자 하다 멈춘 손실 대비·목표 도달 시간 단축 등)를 먼저 짚어 부담을 눅인 뒤 회차를
     제시하라. 무리한 최소량으로 미리 물러서지 말 것.

[member_read] 지금까지 확인된 것 + 지금 클로징 국면을 한 줄로(앵커).
[cheat — 30초 요약 3줄 · 화면 맨 위 · 화면이 줄마다 '이 회원 / 오늘 꼭 / 요청' 이름을 붙인다] 바빠서 이것만 보고 들어가도 되게.
 ① 이 회원: 한 문장으로 사람을 그려라("연말 검진 전에 8kg 빼고 싶은데, 허리 다칠까 봐 운동이 겁나는 분" 결). ★단어·명사 나열 금지("34세 개발자, 8kg 감량, 운동 겁과 허리 뻐근함" ❌).
 ② 오늘 꼭: 오늘 수업에서 반드시 할 한 가지를 동사로 끝나는 짧은 문장으로("숙이기를 처음과 끝에 시켜 달라진 걸 직접 느끼게 하기" 결).
 ③ 요청: 클로징 ask를 그대로 짧게(따옴표 · 40자 안팎).
 각 40자 안팎. 아래 항목과 같은 내용을 짧게 압축(새 내용 창작 금지).
[data_gaps] 관찰이 얇아도 위 전부 반드시 생성("정보 부족" 반환 금지). 긍정 코칭. 충실하면 빈 배열.
${MEMBER_LANG}
${SAY_STYLE}
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명(memberQuote·point_it_out·movements·reaction·memo·observation 등) 값 텍스트 노출 금지. ★data_gaps를 포함한 모든 값 텍스트는 반드시 한국어 문장으로만. 영어 단어·문장 절대 금지.
아래 JSON만 출력(설명·마크다운·코드펜스 금지).
{
  "cheat": ["회원 핵심 한 줄", "오늘 꼭 할 것 한 줄", "클로징 한 마디(대사)"],
  "member_read": "지금까지 확인된 것 + 지금 클로징 국면 한 줄",
  "recall": { "line": "...", "why": "..." },
  "session_plan": [ { "exercise": "...", "how": "...", "point": "...", "lib_ref": null } ],
  "proof": { "moves": [ { "exercise": "...", "how": "...", "target_reaction": "...", "point_it_out": "...", "lib_ref": null }, { "exercise": "...", "how": "...", "target_reaction": "...", "point_it_out": "...", "lib_ref": null } ], "so_what": "...", "if_weak": "..." },
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  ${CLOSING_SEQ_JSON_OT},
  "book_lines": { "open": "...", "cases": "..." },
  "objection_defense": [ { "reason": "price|hesitation|doubt|time|compare", "trigger": "...", "defense": "...", "line": "..." } ],
  "recommended_program": { "pick_ref": 0, "why_fit": "...", "frequency": "...", "duration": "...", "session_logic": "...", "weekly": 2, "alt_ref": null, "alt_why": "" },
  "data_gaps": ["..."]${caseSchemaLine}
}
※ objection_defense는 5개 각 1개. proof.moves는 2개. lib_ref는 정수 또는 null.`;
}

// ④ phase="reregister" user 프롬프트 — 재등록 브리핑(OT 클로징의 PT 대칭).
// ⚠️ origin 독립: ot_log에 의존하지 않는다(인계·외부 PT는 관찰이 없음). PT 관리 데이터만 근거.
function reregisterPrompt(member, ctx, packages = [], favorites = []) {
  const m = member || {};
  const c = ctx || {};
  const g3 = (v) => (v == null || v === "" ? "없음" : v);
  const recent = Array.isArray(c.recent_logs) ? c.recent_logs.filter(Boolean) : [];
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  // 진행 계산(2026-10-13) — 실제 수업 기록의 주 평균(화면이 계산해 보냄)은 '참고'로만 · 없으면 주 2 · 3회 두 경우.
  const avgWk = avgOf(c.weekly_frequency);
  const regFreqs = freqOptions({ avg: avgWk });   // 지금까지 주 평균 + 주 1 · 2 · 3회(2026-10-13 · 세일즈북 meta와 같은 후보)
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) => {
        const per = p.sessions ? Math.round(p.price / p.sessions) : null;
        return `[${i}] name=${g3(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g3(p.duration_label)} · price=${Number(p.price).toLocaleString("ko-KR")}원${per ? ` · 회당=${per.toLocaleString("ko-KR")}원` : ""}${p.note ? ` · note=${p.note}` : ""}${paceText(p, regFreqs)}`;
      }).join("\n")
    : "등록된 패키지 없음";
  const j = c.journey || {};
  const ib = Array.isArray(c.inbody_change) ? c.inbody_change.filter(Boolean) : [];
  const wc = Array.isArray(c.weight_change) ? c.weight_change.filter(Boolean) : [];
  const firstLogs = Array.isArray(c.first_logs) ? c.first_logs.filter(Boolean) : [];
  // 다음 목표 숫자의 근거(2026-10-13) — 지금까지 한 달에 얼마나 바뀌었는지(체지방률은 %p). 기간을 모르면 안 준다.
  const ibMonths = Number(j.months);
  const ibRate = ibMonths > 0 ? ib.map((x) => {
    const d = (Number(x.latest) - Number(x.first)) / ibMonths;
    if (!Number.isFinite(d)) return "";
    const v = Math.round(d * 10) / 10;
    return `${x.label} ${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}${x.unit === "%" ? "%p" : x.unit || ""}`;
  }).filter(Boolean).join(", ") : "";
  const sat = c.satisfaction || null;
  const SAT_KO = { very: "아주 만족", good: "만족", neutral: "보통", low: "아쉬워함" };
  // 2번째 이상 재등록(2026-10-02) — '첫 수업부터'만 말하면 지난번과 같은 이야기가 된다. 이번 계약 기간 변화 + 지난 재등록 때 한 말을 함께 준다.
  const round = Number(c.round) || 1;
  const tp = c.this_period || null;
  const pr = c.prev_rereg || null;
  const RES_KO = { success: "재등록함", hold: "보류했다가 이어감", fail: "안 하기로 했다가 다시 옴", none: "기록 없음" };
  // 목표 로드맵(2026-10-03) — 회원 전용 페이지에 보이는 단계(visible이면 회원이 이미 본 그림).
  const rmap = c.roadmap && Array.isArray(c.roadmap.stages) && c.roadmap.stages.length ? c.roadmap : null;
  const rmCur = rmap ? Math.min(Math.max(Number(rmap.current) || 0, 0), rmap.stages.length - 1) : 0;
  const roadmapBlock = rmap ? `
[목표 로드맵${rmap.visible ? " — 회원 전용 페이지에서 회원이 보고 있음" : ""}] ${rmap.title ? `${rmap.title} · ` : ""}${rmap.stages.map((t, i) => `${i + 1}. ${t}${i < rmCur ? "(완료)" : i === rmCur ? "(지금)" : ""}`).join(" → ")}
 ※ next_roadmap은 이 로드맵의 다음 단계(${rmap.stages[rmCur + 1] || "유지"})와 맞춰라. proven · 요청은 '지금 ${rmCur + 1}단계까지 왔고, 다음은 ○○'처럼 회원이 본 그림과 같은 말로. 로드맵에 없는 단계를 새로 지어내지 마라.
` : "";
  const roundBlock = round >= 2 ? `
[★이번이 ${round}번째 재등록 — 지난 재등록 이후를 중심으로]
${c.period_unavailable ? ` 이번 계약 기간 기록: 지금 확인하지 못했다. 이번 기간 숫자(진행 수업 · 인바디 · 무게)를 말하지 말고, 누적 숫자를 이번 기간 성과처럼 쓰지 마라.` : ` 이번 계약 기간(${g3(tp?.started)}부터): 진행 수업=${g3(tp?.sessions_done)}회
 이번 기간 인바디 변화=${tp?.inbody_change?.length ? tp.inbody_change.map((x) => `${x.label} ${x.first}→${x.latest}${x.unit || ""}`).join(", ") : "없음"}
 이번 기간 운동 무게 변화=${tp?.weight_change?.length ? tp.weight_change.map((x) => `${x.exercise} ${x.first}→${x.latest}kg`).join(", ") : "없음"}`}
 지난 재등록 때: 결과=${pr?.result ? RES_KO[pr.result] || pr.result : "기록 없음"}, 그때 만족도=${pr?.satisfaction?.level ? SAT_KO[pr.satisfaction.level] || pr.satisfaction.level : "없음"}${pr?.satisfaction?.quote ? ` · 회원이 한 말="${pr.satisfaction.quote}"` : ""}
 지난 재등록 때 약속한 다음 단계=${g3(pr?.next_roadmap)}
 지난 재등록 때 그린 앞으로의 모습=${g3(pr?.future_change)}
 ※ proven은 '지난 재등록 이후 이번 기간'의 변화를 먼저 말하고, 첫 수업부터의 큰 그림은 한 마디로 덧붙인다.
 ※ 지난번 약속한 다음 단계를 이번에 얼마나 이뤘는지 정직하게 짚어라(이뤘으면 인정, 아직이면 왜 아직인지와 이번엔 어떻게).
 ※ next_roadmap·future_change는 지난번 것을 되풀이하지 말고 그 다음 단계로. 오래 함께한 회원이니 '처음 오신 분'처럼 말하지 마라.
` : "";
  // 숫자 목표 · 다음 목표(2026-10-11 · lib/ptGoal) — 트레이너가 [맞아요]로 확인한 숫자만 · 다음 목표는 재등록 탭에서 정한 글.
  const gl = c.goal && typeof c.goal === "object" ? c.goal : null;
  const ng = c.next_goal && typeof c.next_goal === "object" && c.next_goal.text ? c.next_goal : null;
  const goalBlock = gl || ng ? `
${gl ? `[숫자 목표 — 트레이너 확인 · 앱 계산] ${g3(gl.goal)} · 지금=${gl.current ?? "기록 없음"}${gl.unit || ""}(시작보다 ${g3(gl.moved)})${gl.elapsed_months != null ? ` · 시작한 지 약 ${gl.elapsed_months}개월` : ""}${gl.done ? " · ★목표 달성" : ""}
 ※ proven · trial_close는 이 숫자를 그대로(반올림 · 부풀리기 금지). 달성 못 했으면 '여기까지 왔다'로 정직하게, 남은 만큼이 이어갈 이유. 퍼센트(%)로 말하지 마라.
` : ""}${ng ? `[★트레이너가 정한 다음 목표] "${String(ng.text).slice(0, 120)}"${ng.goal ? ` (숫자로: ${ng.goal})` : ""}
 ※ next_goal · next_roadmap · 요청의 '다음엔'은 이 목표를 그대로 쓴다. 다른 목표를 지어내지 마라. [현재 PT 방향/목표]는 이미 이 다음 목표로 바뀌어 있을 수 있다.
` : ""}` : "";
  return `[상황·대전제] PT 재등록 대화 준비(재등록은 보통 '오늘 PT 수업 중'에 이뤄진다). 목적 =
실제 관리 기록과 다음 목표를 바탕으로 분명한 재등록 제안을 준비하는 것. 근거는 관찰(1차)이 아니라 '첫 수업부터 지금까지의 변화'와 '회원 만족도'다.
★회원이 납득하는 순서: 그동안 이만큼 변했다(숫자) → 회원이 만족한 점 → 그래서 앞으로 무엇을 더 하고 →
그러면 앞으로 무엇이 달라지는지 → 그 플랜(횟수·가격 이유) → 요청.
재등록은 '새로 파는 것'이 아니라 '그동안 쌓은 만족·변화를 이어가는 것'. 트레이너가 30초에 훑어 외우고 오늘
수업을 재등록으로 자연히 잇는 컨닝페이퍼 — 바로 말할 완성 대사로.

[이 국면 특칙 — 대본 수위] 세일즈·운동 모두 '그대로 말할 실제 대사'까지. 숫자 처방(세트·횟수·각도·중량·
템포)·의료 단정 금지. 없는 성과·에피소드 창작 금지(관리 데이터에 있는 것만).

${REREG_FACT_RULE}${REREG_GOAL_RULE}
[회원 기본정보] name=${g3(m.name)}, age=${g3(m.age)}, job=${g3(m.job)}, mbti=${g3(m.mbti)}, gender=${g3(m.gender)}, pain=${g3(m.pain)}, goal=${g3(m.goal)}
[현재 PT 방향/목표] ${g3(m.pt_direction)}
[PT 관리 데이터 — 유일 근거]
 계약 회차=${g3(c.contract_count)}, 잔여 유료=${g3(c.remaining?.paid)}, 서비스=${g3(c.remaining?.service)},
 완료 수업수=${g3(c.sessions_done)}, 운동 빈도(주당 추정)=${g3(c.weekly_frequency)}
[최근 수업 일지]
${recent.length ? recent.map((s, i) => `${i + 1}. ${s}`).join("\n") : "없음"}
[첫 수업 → 지금 · 앱이 계산한 숫자 — ★숫자는 이것만 그대로 인용(계산·반올림·창작 금지)]
 첫 수업일=${g3(j.first_session)}, 함께한 기간=${j.months ? `약 ${j.months}개월` : "없음"}, 노쇼=${g3(j.noshows)}회
 인바디 변화=${ib.length ? ib.map((x) => `${x.label} ${x.first}→${x.latest}${x.unit || ""}`).join(", ") : "없음"}${ibRate ? `
 인바디 한 달 평균 변화(앱 계산 · 함께한 약 ${j.months}개월 기준 · 대략)=${ibRate}` : ""}
 운동 무게 변화=${wc.length ? wc.map((x) => `${x.exercise} ${x.first}→${x.latest}kg`).join(", ") : "없음"}
[처음 수업 일지(시작점)]
${firstLogs.length ? firstLogs.map((s, i) => `${i + 1}. ${s}`).join("\n") : "없음"}${roundBlock}${roadmapBlock}${goalBlock}
[회원 만족도 — 트레이너 입력] 수준=${sat?.level ? SAT_KO[sat.level] || sat.level : "입력 없음"}, 회원이 한 말=${g3(sat?.quote)}
 ※ '아쉬워함'이면 감추지 말고 왜 아직인지 + 앞으로 어떻게 달라지게 할지를 정직하게(objection low_effect와 같은 결).

[내 PT 패키지] (★이 목록에서만 추천. 없는 패키지·가격·세션수 창작 금지. [n]=참조번호)
${pkgBlock}

[컨닝페이퍼 — 재등록은 '그동안의 근거 → 오늘 수업으로 잇기 → 클로징']
① why_now(왜 더 해야 하는지 — 그동안의 변화 → 앞으로 · 각각 회원에게 그대로 말할 대사):
   - proven: 첫 수업부터 지금까지의 변화. 위 [첫 수업 → 지금] 숫자를 그대로 인용하고 처음 수업 일지(시작점)와
     대비해서("처음엔 ○○도 힘드셨는데 지금은 ○○kg까지 드세요", "체지방 ○→○%"). 숫자가 없으면 출석·빈도·
     일지로. 없는 성과 창작 금지.
   - satisfaction: 회원이 만족한 점을 짚어 주는 대사(회원이 한 말이 있으면 그 말로 되돌려 주기). 입력이 없으면
     최근 일지에서 회원이 좋아한 지점으로, 그것도 없으면 빈 문자열.
   - risk_if_stop: 지금 멈추면 잃는 것(사실 기반 손실 — "쌓은 감각·리듬이 흩어진다"). 없는 위기 창작 금지.
   - next_roadmap: 앞으로 무엇을 더 하는지 — 다음 기간의 구체 목표와 운동 방향(지금 단계 다음에 올 것, 아직 남은 것).
   - future_change: 그러면 앞으로 무엇이 달라지는지 — 다음 기간이 끝났을 때 회원 몸·생활의 그림(goal 축 · 의료 단정·
     성과 보장 금지 · "~를 목표로 가요" 톤).

② session_flow(오늘 수업 흐름/방향 — 재등록으로 잇기): 오늘 PT 수업을 재등록으로 자연히 잇는 진행법.
   압박이 아니라 회원이 스스로 '더 해야겠다'를 느끼게.
   - gap_awareness: 수업 중 '아직 남은/부족한 부분'을 자연스럽게 인지시키는 구체 포인트 + 그 순간 말할 대사
     ("여기 아직 좌우 차이 나시죠? 이게 다음 단계예요"). 회원 상태 근거로, 없는 결함 창작 금지.
   - goal_raise: 수업 중간중간 목표를 한 단계 올려 동기를 계속 부여하는 포인트 + 대사
     ("이제 이건 되시니까, 다음은 ○○ 가봅시다").
   - timing: 오늘 수업 중 재등록 얘기를 꺼내기 가장 좋은 타이밍 한 줄.
   [내 즐겨찾기 운동자료] (트레이너가 별표한 자기 자료 — next_roadmap · gap_awareness · goal_raise에서 '다음 단계
   운동'을 말할 때 이 회원 상황에 맞으면 이 자료의 운동을 '우선' 쓰고, 쓴 자료 번호를 lib_refs에 담아라. [fn]=자료번호)
${favoritesBlock(favorites)}

③ sales_metaphor(선택): 어울릴 때만 회원 세계에서 끌어온 비유 하나(운동·기계 클리셰 금지 · 요청에는 넣지 않는다). metaphor + bridge(재등록 필요성으로).
${METAPHOR_RULE}

${closingSeqInstruction({
    num: "④",
    echoHint: "첫 수업 때 회원 상태나 처음에 한 말, 또는 만족도에 남은 회원 말.",
    trialHint: "그동안 달라진 것 중 회원이 가장 체감한 걸 회원이 고르게 묻는다.",
    nextHint: "[★트레이너가 정한 다음 목표]가 있으면 그 목표 그대로, 없으면 [목표 로드맵]의 다음 단계나 next_roadmap과 같은 다음 목표 한 문장(없으면 지금 성과에서 한 단계 위).",
    askHint: "★재등록은 이어가기형이 기본: 다음 목표를 같이 가자고 묻는다. 계약 · 남은 회차 · 결제 시점은 말하지 마라.",
  })}

④-b ${BOOK_RULE}
 재등록 세일즈북 장 순서: 표지 → 그동안의 여정 → 숫자로 확인된 변화 → (사진) → 지금 어디까지 · 앞으로 → 지금 멈추면 · 이어가면 → 추천 플랜 → 약속.
 echo는 '여정' 장, trial_close는 '변화' 장, next_goal은 '앞으로' 장, stakes는 '멈추면 · 이어가면' 장, promise와 ask는 마지막 '약속' 장에서 말한다(화면이 그렇게 배치) — 그 장에 맞게 써라.
   - open: 표지를 펴며 첫마디(그동안 회원이 만든 걸 정리했다는 결).
   - journey: '그동안의 여정' 장에서 꾸준함을 인정하는 한마디(숫자 반복 금지).
   - photo: 사진 장에서 한마디(사진이 없을 수 있으니 짧게 · 없으면 빈 문자열).

⑤ sweetener(재등록 혜택 — '덤'으로만): 입력에 센터가 확인한 혜택 정보가 있을 때만 그 사실 한 줄(이유가 메인, 혜택은 덤).
   ★지금 입력엔 확인된 혜택 정보가 없으니 빈 문자열로 둔다(할인 · 회당 단가 · 추가 서비스를 만들어 내지 마라 · 혜택은 트레이너가 현장에서 직접).

⑥ objection_defense(재등록 거절 선제 방어 5종): reason 키 고정 — money(금전) · sessions_left(수업 남아 나중에) ·
   low_effect(효과 체감 부족) · time(시간) · schedule(스케줄). 각: trigger(나올 신호) / defense(공감+세일즈 무브,
   반박 아님) / line(그대로 말할 대사). ⚠️low_effect는 방어가 아니라 '왜 아직인지 + 앞으로 어떻게'의 정직한 방향.
   ⚠️허위 긴급성·공포·죄책감 금지.

[recommended_program — 추천 프로그램 + '왜 이 횟수' 근거] 위 [내 PT 패키지]에서 이 회원에게 맞는
   1개(pick_ref)를 확신 있게 골라라. 재등록은 그동안의 관리 데이터로 '이어갈 근거'가 이미 있는 국면이라, '왜 이 횟수가 맞는지' 반박 안 되는 근거를 만든다.
${laterPickRule("그동안의 기록 · 다음 목표 · 실제 수업 빈도로 다음 기간에 필요한 양을 정한다. '지금까지 주 평균'은 참고일 뿐 앞으로의 일정으로 확정하지 마라(앞으로 빈도는 회원과 같이 정한다는 말로).")}
   - why_fit: 이 패키지가 이 회원에게 맞는 이유(목적·불편·그동안의 관리 데이터). 2문장 이내.
   - frequency: 권장 주간 빈도와 '왜 그 빈도인지' 근거(지금까지 실제 빈도는 참고 · 앞으로 일정으로 확정하지 않음). 1문장.
   - duration: 권장 총 기간과 '왜 그 기간인지' 근거. 기간 숫자는 '진행 계산(앱)'과 같게. 1문장.
   - session_logic: pick_ref 패키지의 회차를 그 빈도로 하면 얼마나 걸리는지 '진행 계산(앱)' 숫자로 한 줄(예상 진행 기간으로).
     ★세션수는 pick_ref 패키지의 실제 sessions 값 그대로(새 숫자 창작 금지). ★'가격(원)'은 값 텍스트에
     절대 쓰지 마라 — 금액은 앱이 목록에서 채운다. ※기간제(세션수 없음)면 '왜 이 기간'으로 대체.
   - weekly: frequency에서 권한 주당 횟수 숫자 하나('진행 계산(앱)'에 있는 빈도 중 하나 · 지금까지 주 평균을 그대로 쓰면 그 숫자, 예 1.6).
     세일즈북 플랜 장의 예상 기간을 앱이 이 숫자로 계산한다 — frequency · duration · session_logic · plan_pitch · ask의 빈도와 같아야 한다. 정하지 못했으면 null.
   - alt_ref: 결이 다른 대안 1개(마땅찮으면 null), alt_why 2문장 이내 · 그 대안의 예상 진행 기간도 '진행 계산(앱)'대로 정직하게.
   - 패키지 없으면 pick_ref=null + data_gaps에 "가격 설정 탭에 패키지를 등록하면 콕 집어드려요".

[member_read] 이 회원 그동안 어땠고 지금 재등록 국면을 한 줄로(앵커).
[cheat — 30초 요약 3줄 · 화면 맨 위 · 화면이 줄마다 '이 회원 / 오늘 꼭 / 요청' 이름을 붙인다] 바빠서 이것만 보고 들어가도 되게.
 ① 이 회원: 그동안 어땠고 지금 어떤 마음인지 한 문장(단어 나열 금지 · "처음엔 계단도 숨찼는데 이제 운동이 생활이 된 분" 결).
 ② 오늘 꼭: 오늘 수업에서 반드시 할 한 가지를 동사로 끝나는 짧은 문장으로(달라진 걸 회원이 직접 느끼게 하는 순간 · "처음 했던 운동을 다시 시켜 달라진 무게를 직접 보게 하기" 결).
 ③ 요청: 클로징 ask를 그대로 짧게(따옴표 · 40자 안팎).
 각 40자 안팎. 아래 항목과 같은 내용을 짧게 압축(새 내용 창작 금지).
[data_gaps] 관리 기록이 얇아도 위 전부 반드시 생성("정보 부족" 반환 금지). 긍정 코칭. 충실하면 빈 배열.
${MEMBER_LANG}
${SAY_STYLE}
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명 값 텍스트 노출 금지. 단 objection_defense.reason은 위 영문
키 그대로 둔다(화면 매칭용). 아래 JSON만 출력(설명·마크다운·코드펜스 금지). ★data_gaps를 포함한 모든 값 텍스트는 반드시 한국어 문장으로만. 영어 단어·문장 절대 금지.
{
  "cheat": ["이 회원 한 문장", "오늘 꼭 할 것 한 문장", "요청 질문(대사)"],
  "member_read": "그동안 + 지금 재등록 국면 한 줄",
  "why_now": { "proven": "첫 수업부터 지금까지(숫자 인용)", "satisfaction": "회원이 만족한 점 또는 빈 문자열", "risk_if_stop": "...", "next_roadmap": "앞으로 더 할 것", "future_change": "앞으로 달라질 것" },
  "session_flow": { "gap_awareness": "...", "goal_raise": "...", "timing": "..." },
  "lib_refs": [],
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  ${CLOSING_SEQ_JSON},
  "book_lines": { "open": "...", "journey": "...", "photo": "..." },
  "sweetener": "재등록 혜택 한 줄(덤 · 구체 금액 없이) 또는 빈 문자열",
  "objection_defense": [ { "reason": "money|sessions_left|low_effect|time|schedule", "trigger": "...", "defense": "...", "line": "..." } ],
  "recommended_program": { "pick_ref": 0, "why_fit": "...", "frequency": "...", "duration": "...", "session_logic": "...", "weekly": 2, "alt_ref": null, "alt_why": "" },
  "data_gaps": ["..."]
}
※ objection_defense 5개 각 1개. lib_refs는 쓴 자료 번호(정수) 배열, 안 썼으면 [].`;
}

// ⑥ phase="salesbook" user 프롬프트 — 회원 대면 세일즈북(2차 준비 자료). 독자=회원 본인.
// ⚠️ 트레이너용 브리핑을 변환하지 않고 원천(1차 관찰)에서 회원 톤으로 재생성. 숫자는 recommendedProgram만.
// ⚠️ 금액은 값 텍스트 금지(앱이 packages[ref].price 렌더). 거절방어·클로징시퀀스·member_read 등 내부요소 없음.
//   n차(3차+)면 차수 문구를 따르고, 2차 이후 관찰(history[].observation) 중 가장 최근 것을 같이 근거로 넣는다(2026-10-12).
//   2차(이전 관찰 없음)는 예전과 같은 프롬프트.
function salesbookPrompt(member, report, recommendedProgram, packages, photoLabels, round = 2, history = [], basis = null, inbody = null, hasInbody = true) {
  const m = member || {};
  const r = report || {};
  const n = Number.isInteger(round) && round >= 2 ? round : 2;
  const later = (Array.isArray(history) ? history : []).filter((h) => h && h.observation && typeof h.observation === "object" && h.round >= 2);
  const lastObs = later.length ? later[later.length - 1] : null;
  const laterBlock = later.length ? `
[2차 이후 관찰 — 트레이너가 실제 남긴 기록 · 가장 최근 차수가 '함께 확인한 것'의 첫째 근거]
${later.map((h) => `${h.round}차: ${JSON.stringify(h.observation)}`).join("\n")}
⚠️ 위 JSON 키도 내부 라벨이다. 값 텍스트에 영어 단어를 쓰지 마라.
` : "";
  const rp = recommendedProgram || {};
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  // ⚠️ 세일즈북 pkgBlock은 금액(price·회당)을 넣지 않는다 — 회원 대면 + 숫자 세이프넷 부재라,
  //    "1,560,000원" 같은 금액이 값 텍스트에 새면 FIELD_TERMS(영어 키만 치환)가 못 잡아 그대로 노출된다.
  //    입력에서 아예 제거가 유일한 확실한 차단. sessions_label·meta엔 sessions·frequency·duration만 필요.
  //    가격 '비교'만은 실제 저장된 가격에서 앱이 계산해 말로 넘긴다(총 결제 금액 · 회당 금액을 따로 · 금액 숫자는 없음 · 2026-10-13).
  const cmp = priceCompare(pkgs);
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) =>
        `[${i}] name=${g(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g(p.duration_label)}${cmp[i] ? ` · 가격 비교(앱 계산)=${cmp[i]}` : ""}${p.note ? ` · note=${p.note}` : ""}`
      ).join("\n")
    : "등록된 패키지 없음";
  const labels = Array.isArray(photoLabels) ? photoLabels.filter(Boolean) : [];
  const labelBlock = labels.length ? labels.join(", ") : "없음(사진 미등록)";
  return `[상황] 이 회원의 ${n}차 OT 세일즈북이다. ★만드는 시점 = ${n}차 수업 전(${n}차 대본을 만든 직후). 트레이너가 ${n}차 수업 끝 클로징 때 회원에게 보여준다.
 - 근거 자료는 아래 [1차 관찰]${later.length ? " · [2차 이후 관찰]" : ""}(지난 OT에서 트레이너가 실제로 남긴 기록)뿐이다. 이 내용은 '지난 OT에서 ~' 시점으로 써라('오늘 ~' ❌).
 - ${n}차 수업에서 일어날 변화 · 회원 반응은 아직 모른다. 만들어내지 마라.
너는 회원이 볼 화면의 '텍스트'만 채운다. 폰트·구도·디자인은 이미 정해져 있다. 회원이 직접 읽으니 따뜻한 구어체로.

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, gender=${g(m.gender)}, pain=${g(m.pain)}, goal=${g(m.goal)}

[1차 관찰 — ${later.length ? "기본 근거" : "유일 근거"}(트레이너가 실제 관찰)]
${JSON.stringify({
    movements: r.movements ?? [],
    reaction: r.reaction ?? {},
    goal: r.goal ?? {},
    memberQuote: r.memberQuote ?? "",
    trainer_note: r.trainer_note ?? "",
  }, null, 2)}
⚠️위 [1차 관찰]의 JSON 키(movements·reaction·memo 등)는 내부 라벨이다 — 값 텍스트에 그 영어 단어를 절대 쓰지 마라. 한국어로 풀어라. 없는 관찰·수치·에피소드 창작 금지(회원이 직접 본다).
${laterBlock}
[추천 프로그램(이미 확정) — 이 값만 사용, 새 숫자·금액 창작 금지]
${JSON.stringify({
    pick_ref: rp.pick_ref ?? null,
    alt_ref: rp.alt_ref ?? null,
    frequency: rp.frequency ?? "",
    duration: rp.duration ?? "",
    session_logic: rp.session_logic ?? "",
    why_fit: rp.why_fit ?? "",
    alt_why: rp.alt_why ?? "",
  }, null, 2)}

[내 패키지 목록] (★이 목록에서만 참조. [n]=참조번호 · 회차 표시용 · ★금액은 값 텍스트 금지 — 앱이 채움)
${pkgBlock}

[회원 사진 라벨] ${labelBlock}${basisBlock(basis)}${inbodyPromptBlock(inbody, "book")}

각 슬라이드 채우기:
① cover: subtitle 1줄(무엇을 정리한 자료인지, goal 톤). ※회원명·트레이너 정보·서명은 앱이 프로필에서 채우니 생성 금지.
② goal: headline(회원 목표를 회원 언어로 1줄 · 회원이 말한 목표보다 높이거나 새 기준(층수 · 숫자 · '쉬지 않고' 같은 말)을 더하지 마라) · body(왜 이 목표인지 배경 2문장, 관찰 기반) · current_issues(지금 겪는 것 1~3개, 짧은 명사구 · 신청서 · 관찰 기록에 있는 것만 · 원인 단정 금지).
③ confirmed(함께 확인한 것 = 지난 OT에서 확인한 것 — ★트레이너 전문가 시선이 주인공): before(지난 OT에서 한 동작의 처음 상태 1줄, 작게 · 관찰 기록에 있을 때만,
   없으면 "") · after(같은 동작에서 자세를 잡아 드린 뒤 달라진 점 1줄, 작게 · 관찰 기록에 그 동작의 변화가 있을 때만, 없으면 "" · 기록에 없는 변화를 만들지 마라) ·
   ★before와 after는 반드시 같은 동작의 교정 전 · 후다. 같은 동작의 교정 뒤 변화가 기록에 없으면 after는 ""(개선됐다고 쓰지 마라).
     서로 다른 운동에서 확인한 사실을 전후처럼 묶지 말고, diagnosis에 운동별 관찰로 따로 써라(before에도 여러 동작을 섞지 마라) · diagnosis('제가 본 원인' 1~2문장 · 트레이너 1인칭 — 왜 이런지·뭐가 관건인지. "제가 보니
   원인은 ~"결 · 관찰 기록에서 확인된 것만 · 숨참 · 통증 같은 증상의 원인을 하나로 단정하지 마라 · 관찰한 움직임 과제를 증상의 원인처럼 잇지 마라) · approach('그래서 이렇게 바꿔드려요' 1~2문장 · 트레이너 1인칭 · 순서 언어. "닫힌 흉곽부터 열고 →
   등 감각 심고 → 어깨 라인 올리는 순서로 잡아드려요"결) · member_quote(${lastObs ? `${lastObs.round}차 관찰의 memberQuote, 없으면 1차 memberQuote` : "1차 memberQuote"} 있으면 그 말 그대로, 짧은
   보조 근거로만. 없으면 ""). ★diagnosis·approach는 회원 감상보다 '전문가 계획'을 앞세운다. "혼자선 못 잡는 지점을
   제가 잡아드린다"는 사실·책임의 말이라 OK. 단 의료 단정(치료·완치·진단명)·숫자 처방(세트·중량·각도) 금지 —
   자세·감각·순서 언어까지만.
④ photo_slide:
   - mode: goal이 자세교정·체중감량·체형처럼 '눈에 보이는 변화'면 "within_session"; 벌크업·근력·근비대처럼 '하루에 안 보이는 장기목표'면 "baseline".
   - ★너는 사진을 보지 않는다(이름표만 받는다). 사진 속 변화를 단정하지 마라("눈으로도 달라졌어요" · "좋아졌어요" · "확 달라졌죠" 금지).
   - title·body: within_session이면 "사진으로 함께 비교해 봐요" 결(어디를 같이 볼지 안내). baseline이면 "지금을 시작점으로 남겨 두고, 나중에 같이 비교해요" 결(가짜 성장 금지).
   - points(3): within_session=사진에서 함께 볼 곳(무엇이 달라졌는지가 아니라 어디를 비교할지) / baseline=우선 키울 타겟.
   - [회원 사진 라벨]이 '없음'이면 body에 '사진은 다음에 함께 남겨요' 톤 + points는 유지.
⑤ roadmap: 근시일 3단계(steps) + 중장기 3단계(longterm).
   - current_step(정수, 보통 1 · 근시일 steps 기준. longterm은 대상 아님).
   - steps[3] 각 {title · how(화면에 '어떻게?' 머리말이 붙는 1문장 · 이 단계에서 키울 운동 능력 · 운동 방향 · 트레이너가 조절 · 기록할 것 · 1인칭 순서 언어) ·
     feel(화면에 '이렇게!' 머리말이 붙는 1문장 · 그 단계에서 같이 확인할 변화 · 가능성 표현 · 보장 금지 · 머리말은 쓰지 말 것)}. 지금 등록 구간에 실제로 할 것.
     ★최종 목표 문구를 단계마다 되풀이하지 마라(목표는 '당신의 목표' 장과 longterm에서). 단계는 목표에 필요한 운동 능력과 관리 방향으로 —
     [대본과 같은 상담 방향]이 있으면 그 핵심 근거 · 다음 목표에 나온 능력과 같은 방향이고, 첫 단계는 다음 목표와 같다.
     능력의 개수 · 종류는 이 회원에 맞게(하체 · 코어 · 유산소를 모든 회원에게 넣지 마라 · 단계 3개가 능력 3개라는 뜻이 아니다).
   - longterm[3] 각 {title(짧게) · goal(한 줄 · 회원 최종 목표를 향한 중장기 단계 · 함께 갈 방향 톤 · 결과 · 기한 보장 금지)}.
     steps 이후의 중장기 여정. ★마지막(6번째)은 '혼자서도 유지'처럼 자립·장기 목표 톤.
     longterm이 애매하면 무리해서 채우지 말고 goal에서 자연스럽게 이어지는 것만.
   - 전체 숫자 처방(세트·중량·각도)·의료 단정(치료·완치·진단명)·없는 결과 창작 금지.
⑥ plans[2]: A=추천 프로그램의 pick_ref, B=alt_ref(없으면 목록에서 더 가벼운 패키지 1개 선택). 각
   {ref(정수) · name(코스 이름 · 예 "집중 코스"/"기본 코스" · 숫자를 넣지 마라) · recommended(불린) · meta(빈 문자열) ·
   sessions_label(빈 문자열) · why(2문장 · session_logic을 회원 언어로 · ★회차 · 기간 · 빈도 숫자를 쓰지 마라) ·
   includes[3](아래 [약속 · 서비스 규칙] 안에서만)}. ★meta · sessions_label(회차 · 빈도에 따른 예상 진행 기간)은 앱이 실제 상품 설정으로
   채운다(2026-10-13). ★금액(원)도 값 텍스트에 절대 쓰지 마라 — 앱이 packages[ref].price(+ 회당=price/sessions)를 렌더한다. JSON엔 금액 없음.
   ★가격 이야기는 [내 패키지 목록]의 '가격 비교(앱 계산)' 값만 근거로, '총 결제 금액'과 '회당 금액'을 구분해서 써라.
     회당 금액이 낮아도 총 결제 금액은 가장 높을 수 있다. "한 번에 드는 부담이 낮아요" · "부담이 적어요" · "저렴해요"처럼
     총액인지 회당인지 모호한 말 금지. 가격 비교 값이 없으면 가격 이야기를 하지 마라.
   ★why는 회원에게 보여 줄 추천 이유다. 대본에 섞인 트레이너용 메모는 옮기지 마라. 예상 진행 기간(주 N회면 약 몇 주)은 앱이 meta에 보여 준다.
     상품 기간은 만료일이 아니라 예상 진행 기간이다. '기간 초과' · '센터 규정 확인' · '기간 연장' 같은 만료를 전제한 말을 쓰지 마라.
⑦ closing: services[3~4](제공 서비스 · goal 톤 · 아래 [약속 · 서비스 규칙] 안에서만 · 채울 게 없으면 3개) ·
   vow(트레이너가 회원에게 직접 건네는 다짐 1~2문장 · 손글씨로 렌더됨 · ★판매 동사 금지): 등록하신 기간 동안 트레이너가 실제로 할 일을 바로 말한다.
   ★이 설명이나 판매 기법을 회원에게 옮기지 마라. 글의 성격을 설명하는 문장('등록 권유가 아니라' · '~하겠다는 약속이에요' · '다짐합니다') 금지.
   다짐의 내용은 결과가 아니라 트레이너가 실제로 할 관리 방식(대본의 관리 약속과 같은 쪽)이다. 진심 · 따뜻함은 살려라.
   ★결과 · 기한 보장 금지: "여름 전 목표까지 책임질게요" · "5kg 꼭 빼 드릴게요" · "반드시 ~해 드릴게요" · "보장" 류,
     등록하신 수업 범위를 넘어서는 약속(목표 시점까지 · 끝까지 · 평생) 금지. 목표는 '함께 향해 가는 방향'으로만.

[약속 · 서비스 규칙 — plans.includes · closing.services · vow 공통]
 - 쓸 수 있는 것 = ① [대본과 같은 상담 방향]의 '트레이너의 관리 약속' ② PT 수업 안에서 원래 하는 것(매 수업 동작 · 자세 점검)
   ③ 앱이 늘 제공하는 것: 매 수업 운동일지를 남겨 드리고 회원님이 직접 확인 · 회원 전용 페이지에서 운동 기록 · ${hasInbody ? "인바디 · " : ""}무게 변화 확인.
 - 그 밖의 서비스(홈케어 피드백 · 진행 사진 비교 · 식단 관리 · 카톡 관리${hasInbody ? "" : " · 인바디 측정 · 확인"} · 추가 상담 등)는 ①에 있을 때만. 새 약속 · 새 관리 방식을 만들지 마라.
 - 일정 변경 · 보강은 '센터 규정과 예약 가능한 시간을 확인해 다시 잡아 드려요' 결로만. '그 주 안에 꼭' 같은 확정 약속 금지.
 - 앱 이름은 '회원 전용 페이지'('회원 전용 공간' · '회원 앱' 금지).

[data_gaps] 관찰이 얇아도 위 전부 반드시 생성("정보 부족" 반환 금지). 긍정 코칭. 충실하면 빈 배열.
[출력 언어] 한국어만. 영문 키/코드값 값 텍스트 노출 금지. 아래 JSON만 출력(설명·마크다운·코드펜스 금지).
{
  "cover": { "subtitle": "..." },
  "goal": { "headline": "...", "body": "...", "current_issues": ["...","...","..."] },
  "confirmed": { "before": "...", "after": "...", "diagnosis": "...", "approach": "...", "member_quote": "" },
  "photo_slide": { "mode": "within_session", "title": "...", "body": "...", "points": ["...","...","..."] },
  "roadmap": { "current_step": 1, "steps": [ {"title":"...","how":"...","feel":"..."}, {"title":"...","how":"...","feel":"..."}, {"title":"...","how":"...","feel":"..."} ], "longterm": [ {"title":"...","goal":"..."}, {"title":"...","goal":"..."}, {"title":"...","goal":"..."} ] },
  "plans": [
    { "ref": 0, "name": "집중 코스", "recommended": true, "meta": "", "sessions_label": "", "why": "...", "includes": ["...","...","..."] },
    { "ref": 2, "name": "기본 코스", "recommended": false, "meta": "", "sessions_label": "", "why": "...", "includes": ["...","...","..."] }
  ],
  "closing": { "services": ["...","...","...","..."], "vow": "..." },
  "data_gaps": []
}
※ mode는 within_session·baseline 중 하나. ref는 정수(패키지 참조번호). 금액 텍스트 금지.`;
}

// ⑥-b phase="first_salesbook" — 1차 OT 세일즈북(2026-10-02 대표: "1차 제안이 너무 부실하다").
//   1차 OT 클로징 요청 직전에 회원에게 보여준다. 관찰이 아직 없으니 근거는 사전 문진 + 1차 준비 리포트(오늘 할 운동·추천 프로그램).
//   2차 세일즈북(관찰 근거)과 겹치지 않게: 1차 = 목표·오늘 해본 운동의 이유·앞으로의 길·플랜. '확인했다'는 단정 금지.
//   독자=회원 본인 → SALESBOOK_PREAMBLE. 금액은 값 텍스트 금지(앱이 패키지 가격으로 렌더).
function firstSalesbookPrompt(member, firstAssist, recommendedProgram, packages) {
  const m = member || {};
  const fa = firstAssist || {};
  const rp = recommendedProgram || fa.recommended_program || {};
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  const pkgBlock = pkgs.length
    ? pkgs.map((pk, i) => `[${i}] name=${g(pk.name)} · sessions=${pk.sessions ?? "기간제"} · duration=${g(pk.duration_label)}${pk.note ? ` · note=${pk.note}` : ""}`).join("\n")
    : "등록된 패키지 없음";
  const ex = (Array.isArray(fa.exercises) ? fa.exercises : []).filter(Boolean)
    .map((e, i) => `${i + 1}. [${g(e.slot)}] ${g(e.name)} · 이유=${g(e.reason)} · 바로 느낌=${g(e.feel)}`).join("\n") || "없음";
  return `[상황] 1차 OT 마무리, 등록 이야기를 꺼내기 직전에 트레이너가 태블릿으로 회원에게 2~3분 보여주는 자료(1차 세일즈북)다.
너는 회원이 볼 화면의 '텍스트'만 채운다. 디자인은 정해져 있다. 회원이 직접 읽으니 따뜻한 구어체(~해요)로.
★1차라 아직 관찰 기록이 없다. "확인했다·측정했다·~하셨죠" 같은 단정 금지. 사전 문진과 오늘 함께 한 운동의 '이유'로 설득한다.
★이 자료의 목적은 오늘 PT 등록이다. 단 압박·공포·허위 긴급성 금지. "이 트레이너가 내 목표를 정확히 이해했다"가 느껴지게.

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, gender=${g(m.gender)}, pain=${g(m.pain)}, goal=${g(m.goal)}
[사전 문진(회원이 등록 때 작성 · 있는 것만)] 목표 시점=${g(m.goal_deadline)}, 원하는 페이스=${g(m.training_pace)}, 부상·수술=${g(m.injury_history)},
 운동 경험=${g(m.exercise_level)}, 예전에 그만둔 이유=${g(m.quit_reason)}, 받아본 유료 운동=${g(m.past_exercise)}, 가능 빈도·시간=${g(m.availability)}

[오늘 함께 한 운동(1차 준비 리포트의 4칸)]
${ex}

[추천 프로그램(이미 확정) — 이 값만 사용, 새 숫자·금액 창작 금지]
${JSON.stringify({ pick_ref: rp.pick_ref ?? null, alt_ref: rp.alt_ref ?? null, frequency: rp.frequency ?? "", duration: rp.duration ?? "", session_logic: rp.session_logic ?? "", why_fit: rp.why_fit ?? "", alt_why: rp.alt_why ?? "" }, null, 2)}

[내 패키지 목록] (★이 목록에서만 참조. [n]=참조번호 · ★금액은 값 텍스트 금지, 앱이 채움)
${pkgBlock}

각 장 채우기:
① cover: subtitle 1줄(이 회원 목표를 향한 첫 계획이라는 톤). ※회원명·트레이너 정보·서명은 앱이 채우니 생성 금지.
② goal: headline(회원 목표를 회원 언어로, 목표 시점이 있으면 넣어서 1줄) · body(왜 지금 이 목표인지 · 예전에 그만둔 이유가 있으면
   "이번엔 그 지점을 같이 넘어요" 결로 2문장) · current_issues(지금 겪는 것 3개 · 짧은 명사구 · 문진·불편 부위 기반 · 없으면 목표에서 자연스러운 것).
③ today(오늘 해본 운동 · 핵심 장): intro(1문장 · "오늘 한 운동은 아무거나 고른 게 아니에요" 결) · items[4](위 4칸 순서 그대로 · 각
   {name: 회원이 알아듣는 짧은 이름(전문용어·세팅 설명 빼고) · why: 이 회원이 이걸 해야 하는 이유 1문장(목표·문진 기반) · feel: "이런 느낌이 왔다면
   제대로 된 거예요" 결 1문장}) · so_what(1~2문장 · 혼자 하면 이 느낌을 못 찾는 이유 = 왜 같이 해야 하는지. 사실 기반·압박 아님).
④ roadmap: 근시일 3단계(steps) + 중장기 3단계(longterm). current_step=1. steps[3] 각 {title · how(화면에 '어떻게?' 머리말이 붙는 1문장 · 트레이너 1인칭 순서 언어) ·
   feel(화면에 '이렇게!' 머리말이 붙는 1문장 · 회원이 느낄 변화 · 머리말은 쓰지 말 것)}. longterm[3] 각 {title(짧게) · goal(한 줄 · 회원 최종 목표를 향한 약속 톤 · 마지막은 '혼자서도 유지' 자립 톤)}.
⑤ plans[2]: A=추천 프로그램의 pick_ref, B=alt_ref(없으면 목록에서 더 가벼운 패키지 1개). 각 {ref(정수) · name("집중 코스" 결) · recommended(불린) ·
   meta("주 N회 · 약 M개월" — A는 frequency·duration에서) · sessions_label("함께 K회" — 패키지 sessions) · why(2문장 · session_logic을 회원 언어로) ·
   includes[3](포함 서비스 · 회원 전용 페이지 기록 포함)}. ★금액(원) 값 텍스트 금지. 패키지가 없으면 plans는 빈 배열.
⑥ closing: services[4](매 수업 점검·기록 / 홈케어 피드백 / 진행 사진 / 회원 전용 페이지에 기록 쌓기 · goal 톤) · vow(트레이너 다짐 1~2문장 · 등록 권유가 아니라
   책임지겠다는 약속 · 판매 동사 금지 · 손글씨로 렌더됨).

[금지] 숫자 처방(세트·횟수·중량·각도·시간) · 의료 단정(치료·완치·진단명 · 통증은 '불편/부담'까지) · 없는 결과·수치·에피소드 창작 · 긴 줄표(—).
[출력 언어] 한국어만. 영문 키/코드값 값 텍스트 노출 금지. 아래 JSON만 출력(설명·마크다운·코드펜스 금지).
{
  "cover": { "subtitle": "..." },
  "goal": { "headline": "...", "body": "...", "current_issues": ["...","...","..."] },
  "today": { "intro": "...", "items": [ {"name":"...","why":"...","feel":"..."}, {"name":"...","why":"...","feel":"..."}, {"name":"...","why":"...","feel":"..."}, {"name":"...","why":"...","feel":"..."} ], "so_what": "..." },
  "roadmap": { "current_step": 1, "steps": [ {"title":"...","how":"...","feel":"..."}, {"title":"...","how":"...","feel":"..."}, {"title":"...","how":"...","feel":"..."} ], "longterm": [ {"title":"...","goal":"..."}, {"title":"...","goal":"..."}, {"title":"...","goal":"..."} ] },
  "plans": [ { "ref": 0, "name": "집중 코스", "recommended": true, "meta": "주 2회 · 약 3개월", "sessions_label": "함께 24회", "why": "...", "includes": ["...","...","..."] } ],
  "closing": { "services": ["...","...","...","..."], "vow": "..." }
}
※ ref는 정수(패키지 참조번호). 금액 텍스트 금지.`;
}

// ⑦ phase="reg_salesbook" user 프롬프트 — 재등록 회원 대면 세일즈북. 독자=회원 본인.
// ⚠️ 숫자(변화량·횟수·무게·금액)는 앱이 데이터에서 렌더한다. 너는 그 숫자를 '해석·프레이밍'하는 텍스트만.
// ⚠️ 표에 나올 수치를 값 텍스트에 새 숫자로 만들지 마라(주어진 change 요약 범위에서만 언급). 금액 금지.
function regSalesbookPrompt(member, change, recommendedProgram, packages, photoLabels, extra = {}) {
  const m = member || {};
  const ch = change || {};
  const rp = recommendedProgram || {};
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) => `[${i}] name=${g(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g(p.duration_label)}${p.note ? ` · note=${p.note}` : ""}`).join("\n")
    : "등록된 패키지 없음";
  const labels = Array.isArray(photoLabels) ? photoLabels.filter(Boolean) : [];
  return `[상황] 이 회원의 '재등록 세일즈북'이다. 트레이너가 오늘 PT 수업 중/후에 회원에게 직접 보여준다.
너는 회원이 볼 화면의 '텍스트'만 채운다. 숫자(변화량·횟수·무게·금액)는 앱이 데이터에서 직접 렌더하니 만들지 마라.
회원이 직접 읽으니 따뜻한 구어체로. ★핵심: 그동안의 변화를 확실히 인정해주되, '다 됐다'가 아니라 '여기까지가 토대,
지금부터가 본론'으로 프레이밍(남은 단계가 진짜 · '멈추면 되돌아갈 수 있다'는 이 회원 기록에 근거가 있을 때만). 판매 압박·공포·죄책감·허위 긴급성 금지.

${REREG_FACT_RULE}[★다음 목표 숫자 — 세일즈북] 다음 목표 숫자는 [★대본과 같은 상담 방향]의 '다음 목표'에 있는 숫자만 쓴다(새 숫자 금지).
 대본이 제안형("~를 목표로 잡아 볼 수 있어요")이면 세일즈북도 제안형으로, 이미 정한 목표면 그대로. 달성 약속 금지 · 단위(%p · kg)는 대본과 같게.
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, gender=${g(m.gender)}, pain=${g(m.pain)}, goal=${g(m.goal)}
[현재 PT 방향/목표] ${g(m.pt_direction)}

[그동안의 변화 요약 — 앱이 표로 렌더할 실제 데이터(너는 해석만, 새 숫자 금지)]
${JSON.stringify({
    months: ch.journey?.months ?? null,
    sessions_done: ch.journey?.sessions_done ?? null,
    weekly_frequency: ch.journey?.weekly_frequency ?? null,
    inbody: (ch.inbody || []).map((r) => ({ 지표: r.label, 처음: r.first, 지금: r.latest, 단위: r.unit })),
    exercises: (ch.exercises || []).map((e) => ({ 종목: e.exercise, 처음: e.first, 지금: e.latest, 단위: "kg" })),
  }, null, 2)}

[추천 프로그램(이미 확정) — 이 값만, 새 숫자·금액 창작 금지]
${JSON.stringify({ pick_ref: rp.pick_ref ?? null, alt_ref: rp.alt_ref ?? null, frequency: rp.frequency ?? "", duration: rp.duration ?? "", session_logic: rp.session_logic ?? "", why_fit: rp.why_fit ?? "", alt_why: rp.alt_why ?? "" }, null, 2)}

[내 패키지 목록] (★이 목록에서만 참조 · [n]=참조번호 · ★금액 값 텍스트 금지 — 앱이 채움)
${pkgBlock}

[회원 사진 라벨] ${labels.length ? labels.join(", ") : "없음(사진 미등록)"}${basisBlock(extra.basis)}${regPeriodBlock(extra.period)}

각 슬라이드 채우기:
① cover.subtitle: 1줄(그동안의 변화 + 앞으로의 방향 톤). ※회원명·트레이너·서명은 앱이 채움.
② journey: headline(그동안의 여정 1줄 · 위 기간/횟수 데이터 존중) · sub(꾸준함이 이미 몸에 남았다는 인정 1줄).
③ change: title("숫자로 확인된 변화" 결) · sub(표를 보기 전 한 줄) · caption(★표 아래 프레이밍 1~2문장 —
   위 변화 요약에서 가장 큰 성과 1개를 짚어 '이게 토대, 지금부터 본론'으로. '쉬면 줄어들 수 있다' 같은 일반 설명은 이 회원 숫자를 짚은 뒤 한 번만 · 겁주는 말로 쓰지 마라.
   ★표에 없는 새 숫자 만들지 말 것. 있는 값만 언급).
④ photo: title·body(비포애프터 사진 대면용 1줄+1줄. 라벨 '없음'이면 body에 '사진 이제부터 함께 남겨요' 톤).
⑤ roadmap: current_step(정수 · 지금 어느 단계인지 · 보통 2~3) · stages[4] 각 {title(짧게) · desc(1줄 · 이 단계에서
   무엇을 · 회원 향한 톤)}. ★1~current는 '해온 것', current는 '진행중', 이후는 '앞으로'. 마지막은 '혼자서도 유지·자립'.
   숫자 처방·의료 단정 금지.
⑥ fork: stop(1~3개 · 지금 멈추면 잃을 수 있는 것 — 위 [그동안의 변화 요약] · 이번 기간 기록에 근거가 있는 것만(예: 기록에 있는 무게 · 지표 · 꾸준히 온 리듬).
   기록에 근거가 하나뿐이면 1개만 쓴다 · 일반론으로 개수를 채우지 마라 · '~수도 있어요' 결) · go[3](이어가면 할 것 · 다음 목표 쪽 — 남은 단계 진입).
   ⚠️허위 긴급성·공포 금지 · 정직한 사실로만.
⑦ plans[2]: A=pick_ref, B=alt_ref(없으면 목록에서 더 가벼운 1개). 각 {ref(정수) · name(숫자를 넣지 마라) · recommended(불린) ·
   meta(빈 문자열) · sessions_label(빈 문자열) · why(2문장 · session_logic을 회원 언어로 · ★회차 · 기간 · 빈도 숫자를 쓰지 마라) · includes[3](PT 수업 안에서 원래 하는 것만 · 새 서비스 · 혜택 금지)}.
   ★meta · sessions_label(회차 · 예상 기간)은 앱이 실제 상품 설정으로 채운다(2026-10-13). ★금액(원) 값 텍스트 금지 — 앱이 채움.
⑧ closing: services[4](제공 서비스 · goal 톤 · PT 수업 안에서 원래 하는 것과 정해진 관리 약속만) · vow(트레이너 약속 1~2문장 · 손글씨 렌더 · 판매 동사 금지).

[data_gaps] 데이터 얇아도 위 전부 생성("정보 부족" 금지). 긍정 코칭. 충실하면 빈 배열.
[출력 언어] 한국어만. 영문 키/코드값 값 텍스트 노출 금지. 아래 JSON만(설명·마크다운·코드펜스 금지).
{
  "cover": { "subtitle": "..." },
  "journey": { "headline": "...", "sub": "..." },
  "change": { "title": "...", "sub": "...", "caption": "..." },
  "photo": { "title": "...", "body": "..." },
  "roadmap": { "current_step": 2, "stages": [ {"title":"...","desc":"..."}, {"title":"...","desc":"..."}, {"title":"...","desc":"..."}, {"title":"...","desc":"..."} ] },
  "fork": { "stop": ["기록에 근거한 것만 1~3개"], "go": ["...","...","..."] },
  "plans": [
    { "ref": 0, "name": "집중 코스", "recommended": true, "meta": "", "sessions_label": "", "why": "...", "includes": ["...","...","..."] },
    { "ref": 2, "name": "기본 코스", "recommended": false, "meta": "", "sessions_label": "", "why": "...", "includes": ["...","...","..."] }
  ],
  "closing": { "services": ["...","...","...","..."], "vow": "..." },
  "data_gaps": []
}
※ ref는 정수. 금액 텍스트 금지. stages는 4개.`;
}

// ⑧ phase="inbody" user 프롬프트 — 회원 대면 인바디 분석. 독자=회원 본인.
// ⚠️ 트레이너 영업 멘트 아님 — '앱이 객관적으로 분석·제안'하는 톤(회원 방어감↓·트레이너 부담↓).
// ⚠️ 의료 단정 금지 · 숫자 처방 금지 · 압박/죄책감 금지 · 금액 없음. SALESBOOK_PREAMBLE 사용.
const INBODY_LABELS = [
  ["weight", "체중", "kg"],
  ["skeletal_muscle", "골격근량", "kg"],
  ["body_fat_mass", "체지방량", "kg"],
  ["body_fat_pct", "체지방률", "%"],
  ["bmr", "기초대사량", "kcal"],
  ["visceral_fat_level", "내장지방", "lv"],
];
// phase="roadmap" — 회원 전용 페이지 '나의 목표 로드맵' 초안(2026-10-03). 회원이 직접 읽는다(SALESBOOK_PREAMBLE).
// 트레이너가 고치고 '회원에게 보이기'를 켜야 보인다. 숫자는 앱이 계산한 것만 근거로.
function roadmapPrompt(member, ctx) {
  const m = member || {};
  const c = ctx || {};
  const ib = Array.isArray(c.inbody_change) ? c.inbody_change.filter(Boolean) : [];
  const wc = Array.isArray(c.weight_change) ? c.weight_change.filter(Boolean) : [];
  return `[상황] PT 회원의 '나의 목표 로드맵'을 만든다. 회원 전용 페이지에 단계 목록으로 보이고, 회원이 '지금 어디쯤이고 앞으로 무엇이 남았는지'를 한눈에 본다.
트레이너가 먼저 고친 뒤 회원에게 공개한다.

[회원] name=${g(m.name)}, age=${g(m.age)}, gender=${g(m.gender)}, goal=${g(m.goal)}, pain=${g(m.pain)}
[현재 PT 방향] ${g(m.pt_direction)}
[진행] 지금까지 수업 ${g(c.sessions_done)}회 · 함께한 기간 ${c.months ? `약 ${c.months}개월` : "없음"}
[인바디 변화] ${ib.length ? ib.map((x) => `${x.label} ${x.first}→${x.latest}${x.unit || ""}`).join(", ") : "없음"}
[운동 무게 변화] ${wc.length ? wc.map((x) => `${x.exercise} ${x.first}→${x.latest}kg`).join(", ") : "없음"}
[재등록 때 정한 다음 단계] ${g(c.next_roadmap)}
[재등록 때 그린 앞으로의 모습] ${g(c.future_change)}

[만드는 법]
- 단계 3~5개. 목표(goal)와 불편 부위(pain)에서 시작해 '혼자서도 유지'로 끝나는 흐름(예: 자세 잡기 → 근력 쌓기 → 체지방 정리 → 혼자서도 유지하기).
- 각 단계 title: 회원 말로 10자 안팎(전문용어 금지 · "코어 안정화"보다 "몸통 힘 기르기").
- 각 단계 detail: 그 단계를 지나면 회원 생활에서 무엇이 달라지는지 한 문장(40자 안팎 · "~해져요" 결 · 일상 장면으로).
- current: 지금 단계 번호(0부터). 진행 · 변화 숫자를 근거로 판단하고, 근거가 없으면 0.
- title(로드맵 제목): 회원 목표를 한 줄로(15자 안팎).
- ★숫자 약속 금지(기간 · 감량 kg · 세트 · 횟수 · 중량). 의료 단정 금지. 등록 권유 · PT · 트레이너 · 함께 같은 세일즈 표현 금지(객관적 계획표다).
${NO_DASH_RULE}
아래 JSON만 출력(설명 · 마크다운 · 코드펜스 금지):
{"title":"목표 한 줄","stages":[{"title":"단계 이름","detail":"달라지는 것 한 문장"}],"current":0}`;
}

function inbodyPrompt(member, inbody) {
  const m = member || {};
  const cur = (inbody && inbody.latest) || {};
  const prev = (inbody && inbody.prev) || null;
  const lines = INBODY_LABELS
    .filter(([k]) => cur[k] != null)
    .map(([k, label, unit]) => {
      const d = prev && prev[k] != null ? ` (이전 ${prev[k]}${unit})` : "";
      return `- ${label}: ${cur[k]}${unit}${d}`;
    }).join("\n") || "측정치 없음";
  return `[상황] 이 회원의 인바디(체성분) 결과를 '회원 본인에게 보여주며' 설명하는 화면이다. 트레이너의 영업
멘트가 아니라 '앱이 객관적으로 분석해 제안하는' 리포트다. 회원이 직접 읽으니 따뜻한 구어체로, 방어감 없이.

[목적] 회원이 자기 수치를 이해하고 "아, 관리(운동)를 해야겠구나"를 스스로 납득하게 — 압박이 아니라 본인 데이터로.

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, gender=${g(m.gender)}, goal=${g(m.goal)}, pain=${g(m.pain)}
[인바디 측정치 (이번 · 괄호는 이전)]
${lines}

[해석 원칙]
- 각 수치를 회원 goal 렌즈로 해석하라(체지방·골격근량·내장지방·기초대사·체중). 주어진 수치만, 없는 값 창작 금지.
- goal이 체중감량/체형이면 체지방·내장지방·골격근 균형을, 근력·벌크업이면 골격근·기초대사를 중심으로.
- ★의료 단정 절대 금지 — 내장지방·체지방이 높아도 '질병·진단·위험' 단정 금지, '관리가 필요한 상태'까지만.
- 숫자 처방(세트·횟수·중량·칼로리 수치) 금지. 식단은 방향(예: "단백질 늘리고 야식 줄이기")까지만.
- 회원이 부담·죄책감 느끼게 하지 말 것 — '지금부터 하면 된다'는 긍정 프레임.
- ★★이건 세일즈가 아니라 '객관적 데이터 분석'이다. 'PT·트레이너·전문가·함께·혼자보다·시행착오를 줄인다·
  등록·수업' 같은 등록 권유·세일즈 표현 절대 금지. 앱은 오직 이 회원의 수치를 있는 그대로 해석하고 방향을
  알려줄 뿐이다. 회원이 그 객관적 분석을 보고 '아, 제대로 된 관리가 필요하겠구나'를 스스로 느끼게 하라
  (직접 "그러니 PT 받으세요"는 회원이 방어하게 만들어 역효과 — 절대 금지).

[채울 것]
- headline: 오늘 인바디로 확인한 핵심을 회원 이름 톤으로 1줄(goal 렌즈).
- metrics[]: 주어진 각 수치마다 {label(한글 지표명) · state(지금 상태를 회원 말로 1문장) · meaning(이게 goal에
  어떤 의미인지 1문장)}. 없는 수치는 넣지 마라.
- diet[2~3]: 식습관 제안(구체적·실천 가능·방향).
- lifestyle[2~3]: 생활습관 제안(수면·활동량·스트레스 등).
- exercise[2~3]: 어떤 운동을 왜 해야 하는지 방향(이 수치를 개선하려면).
- why_now: 종합 — 지금 이 몸 상태에서 목표까지 가려면 무엇을(근육·체지방·식사·습관 중 무엇을) 어떤 방향으로
  관리해야 하는지, 그리고 왜 지금이 시작하기 좋은 시점인지를 '객관적으로' 2~3문장. ★핵심: 이 목표(예: 근육은
  늘리며 체지방은 관리)가 왜 '정교한 관리'가 필요한 일인지를 사실로 짚어라 — 단, PT·트레이너·함께·혼자 같은
  세일즈 단어는 절대 쓰지 마라. 난이도·중요성을 객관적으로 말하면 '전문적 관리가 필요하겠다'는 결론은 회원이
  스스로 내린다. 파는 느낌 0, 데이터가 말하는 톤.
- data_gaps: 측정이 얇으면 '무엇을 더 재면 좋은지' 긍정 코칭. 충실하면 빈 배열.

[출력 언어] 한국어만. 영문 키/코드값 값 텍스트 노출 금지. 아래 JSON만(설명·마크다운·코드펜스 금지).
{
  "headline": "...",
  "metrics": [ { "label": "...", "state": "...", "meaning": "..." } ],
  "diet": ["...", "..."],
  "lifestyle": ["...", "..."],
  "exercise": ["...", "..."],
  "why_now": "...",
  "data_gaps": []
}`;
}

// ⑨ phase="posture" user 프롬프트 — 회원 대면 체형평가 분석. 독자=회원 본인.
// ⚠️ 인바디와 동일 철학: '앱이 객관 분석' · 의료 단정 금지 · 세일즈 표현 금지 · SALESBOOK_PREAMBLE.
const POSTURE_LABELS = [
  ["forward_head", "거북목"],
  ["round_shoulder", "라운드숄더"],
  ["pelvic_tilt", "골반 전·후 경사"],
  ["pelvic_rotation", "골반 좌우 틀어짐"],
  ["spine_balance", "척추 좌우 불균형"],
  ["knee_align", "무릎 정렬(X·O다리)"],
  ["ankle_arch", "발목·발아치"],
];
const POSTURE_STATE_KO = { normal: "정상", mild: "경도", moderate: "중등도", severe: "심함" };
function posturePrompt(member, posture) {
  const m = member || {};
  const f = (posture && posture.findings) || {};
  const note = (posture && posture.note) || "";
  const photoUrls = Array.isArray(posture?.photoUrls) ? posture.photoUrls.filter((p) => p && p.url) : [];
  const hasPhotos = photoUrls.length > 0;
  const photoOrder = photoUrls.map((p, i) => `${i + 1}번=${p.label || "사진"}`).join(", ");
  const issues = POSTURE_LABELS
    .filter(([k]) => f[k] && f[k] !== "normal")
    .map(([k, label]) => `- ${label}: ${POSTURE_STATE_KO[f[k]] || f[k]}`).join("\n");
  const block = issues || (hasPhotos ? "트레이너 체크 없음 — 아래 사진을 직접 관찰해 소견을 도출하라." : "특이 소견 없음(대체로 정상)");
  const visionBlock = hasPhotos
    ? `\n[체형 사진 — ★AI가 직접 관찰] 첨부된 사진을 '가로세로 그리드' 기준으로 직접 보고 소견을 도출하라.
사진 순서: ${photoOrder}. 관찰 포인트 — 좌우 어깨 높이·기울기, 골반 높이·좌우 균형, 머리 전방이동(거북목),
무릎 정렬(X·O), 발목·아치, 척추 정렬. 세로 중심선(플럼라인) 대비 머리·어깨·골반·무릎이 벗어난 정도를 보라.
★사진에서 '명확히 보이는 것'만 소견에 담고, 안 보이는 각도·부위는 추정하지 마라. 위 트레이너 체크가 있으면 함께 참고.
★단 사진만으로 의학적 단정은 금지(진단명·질환·치료 표현 금지) — '틀어짐·불균형·굳음' 상태 표현까지만.\n`
    : "";
  return `[상황] 이 회원의 체형평가(자세 체크) 결과를 '회원 본인에게 보여주며' 설명하는 화면이다. 트레이너의
영업 멘트가 아니라 '앱이 객관적으로 분석해 제안하는' 리포트다. 회원이 직접 읽으니 따뜻한 구어체로.

[목적] 회원이 자기 체형 상태를 이해하고 '아, 관리(운동)를 해야겠구나'를 스스로 납득하게 — 압박 아니라 사실로.

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, gender=${g(m.gender)}, job=${g(m.job)}, goal=${g(m.goal)}, pain=${g(m.pain)}
[체형평가 소견 (경도 이상만 · 트레이너 관찰)]
${block}${note ? `\n[트레이너 메모] ${note}` : ""}
${visionBlock}
[해석 원칙]
- 주어진 소견만 해석하라(없는 증상·부위 창작 금지). goal·job(직업상 자세 습관)·pain과 엮어라.
- ★의료 단정 절대 금지 — '측만증·디스크·질환' 등 진단명·치료 단정 금지. '틀어짐·불균형·굳음' 상태 표현까지만.
- 숫자 처방(세트·횟수·각도·중량) 금지. 운동은 방향(예: "굳은 가슴 열고 등 세우기")까지만.
- 회원이 부담·죄책감 느끼게 하지 말 것 — '지금부터 바로잡으면 된다'는 긍정 프레임.
- ★★이건 세일즈가 아니라 '객관적 분석'이다. 'PT·트레이너·전문가·함께·혼자보다·시행착오·등록·수업' 등 세일즈
  표현 절대 금지. 왜 이 체형이 정교한 교정이 필요한 일인지 사실로만 짚고, 결론은 회원이 스스로 내리게.

[채울 것]
- headline: 오늘 체형평가로 확인한 핵심을 회원 이름 톤으로 1줄.
- findings[]: 소견마다 {label(한글 항목명) · state(경도/중등도/심함) · meaning(이게 몸·목표·일상에 주는 영향 1~2문장)}.
- exercise[2~3]: 이 체형을 바로잡는 운동 방향(무엇을 왜).
- lifestyle[2~3]: 일상 자세·습관 교정(직업 자세 등).
- why_now: 객관 종합 — 지금 상태와 왜 지금 관리가 좋은지를 '사실'로 2~3문장(세일즈 단어 금지).
- data_gaps: 평가가 얇으면 '무엇을 더 보면 좋은지' 긍정 코칭. 충실하면 빈 배열.

[출력 언어] 한국어만. 영문 키/코드값 노출 금지. 아래 JSON만(설명·마크다운·코드펜스 금지).
{
  "headline": "...",
  "findings": [ { "label": "...", "state": "...", "meaning": "..." } ],
  "exercise": ["...", "..."],
  "lifestyle": ["...", "..."],
  "why_now": "...",
  "data_gaps": []
}`;
}

// 최종 안전망: 모델이 출력 텍스트에 흘린 필드명(코드값)을 한글로 치환.
// 키/구조는 건드리지 않고 '문자열 값'만 재귀적으로 훑는다.
const FIELD_TERMS = [
  ["memberQuote", "회원 한마디"],
  ["memberAware", "회원이 스스로 인지한 항목"],
  ["plan2nd", "2차에 풀 것"],
  ["goal.detail", "목적 상세"],
  ["goal_identified", "목적 파악 여부"],
  ["goal_type", "목적 유형"],
  ["closing_result", "클로징 결과"],
  ["closing_approach", "클로징 방향"],
  ["attitudeTags", "태도 태그"],
  ["stimulus", "자극 인지도"],
  // B2 재료 필드명 — 값 텍스트 누출 방어(trainer_note·sales_intensity).
  ["trainer_note", "트레이너 종합 소견"],
  ["sales_intensity", "세일즈 강도"],
  ["stimulus_response", "자극반응 대처"],
  // ① phase:first 필드명 — 값 텍스트 누출 결정적 제거(프롬프트 인용금지 지침과 병행 방어).
  ["connects_to_closing", "세일즈로 이어지는 지점"],
  ["closing_compass", "세일즈 방향"],
  ["soft_closing", "부담 없는 마무리"],
  ["movement_cues", "치트키 동작"],
  ["observe_targets", "관찰 항목"],
  ["why_higher_odds", "세일즈 근거"],
  ["approach_tag", "접근 축"],
  ["watch_for", "주의 신호"],
  ["data_gaps", "더 확인할 점"],
  ["hypothesis", "가설"],
  // ⑤ acute 필드명 — 값 텍스트 누출 방어.
  ["safety", "안전 안내"],
  ["avoid_repeat", "다른 벡터"], // ⚠️ avoid보다 먼저(긴 키 우선) — sanitizeText 순차치환 오치환 방지.
  ["avoid", "피할 움직임"],
  ["alternatives", "대체 접근"],
  ["principle", "원리"],
  // B-1 ① 신규 필드명 — 값 텍스트 누출 방어(추천 프로그램·거절 대응).
  ["recommended_program", "추천 프로그램"],
  ["why_fit", "맞는 이유"],
  ["alt_why", "대안 이유"],
  ["pick_ref", "추천 번호"],
  ["alt_ref", "대안 번호"],
  ["reframe_direction", "공감 방향"],
  ["sales_move", "세일즈 방향"],
  ["customer_says", "회원이 흔히 하는 말"],
  ["objections", "거절 대응"],
  // D-3 case_feedback 필드명 — 값 텍스트 누출 방어.
  ["case_feedback", "과거 케이스 거울"],
  ["diagnosis", "진단"],
  ["proven_lead", "통한 접근 리딩"],
  ["your_read", "네 판단"],
  ["caseTier", "경향 신뢰도"],
  ["member_read", "회원 한 줄"],
  ["opening", "오프닝"],
  // ① 3스텝 재설계 신규 키(exercises 블록) 누출 방어.
  ["workout_intro", "오늘 운동 안내"],
  ["exercises", "운동"],
  ["lib_refs", "자료 번호"],
  ["lib_ref", "자료 번호"],
  ["reason", "이유"],
  ["cue", "짚을 말"],
  ["target_exercise", "타겟 운동"],
  ["target_reaction", "노릴 반응"],
  ["point_it_out", "짚어줄 말"],
  ["so_what", "등록 논리"],
  ["sales_metaphor", "세일즈 비유"],
  ["objection_defense", "거절 방어"],
  ["closing_line", "클로징 한마디"],
  // 클로징 시퀀스 재설계 — 신규 키 누출 방어. ⚠️ closing_sequence는 아래 ["closing","클로징"]보다 먼저(긴 키 우선).
  ["closing_sequence", "클로징 흐름"],
  ["trial_close", "떠보기"],
  ["stakes", "핵심 근거"],
  ["ask", "요청"],
  ["nudge", "가벼운 한마디"],
  ["hold", "침묵"],
  ["flush", "진짜 이유 꺼내기"],
  ["plan_pitch", "플랜 제시"],
  ["moves", "동작"],
  ["session_logic", "세션 근거"],
  ["frequency", "빈도"],
  ["duration", "기간"],
  ["recall", "지난 소환"],
  ["proof", "증명 동작"],
  ["if_weak", "반응 약할 때"],
  ["session_plan", "수업 구성"],
  ["why_now", "재등록 근거"],
  ["session_flow", "수업 흐름"],
  ["gap_awareness", "부족분 인지"],
  ["goal_raise", "목표 상향"],
  ["risk_if_stop", "멈추면"],
  ["next_roadmap", "다음 단계"],
  ["sweetener", "혜택"],
  ["closing", "클로징"],
  // 1차 관찰 원본 JSON 키 누출 방어(2차 브리핑에 movements·reaction.memo 등 영어 노출 제보).
  // ⚠️ 순서: 복합·긴 키 먼저 — reaction.memo→memo, movements→movement, observations→observation.
  //    (target_reaction·stimulus_response는 위쪽에 이미 있어 reaction/response보다 먼저 처리됨.)
  ["reaction.memo", "관찰 메모"],
  ["movements", "관찰 동작"],
  ["movement", "동작"],
  ["observations", "관찰"],
  ["observation", "관찰"],
  ["reaction", "반응"],
  ["memo", "메모"],
  // 세일즈북(salesbook) 신규 키 누출 방어(회원이 직접 보므로 영어 노출 특히 치명적).
  //   ⚠️ roadmap은 위 ["next_roadmap",...] 뒤라 안전(긴 키 먼저 처리됨).
  ["current_issues", "지금 겪는 것"],
  // ⑧⑨ inbody·posture 회원 대면 키 누출 방어.
  ["lifestyle", "생활습관"],
  ["meaning", "의미"],
  ["findings", "소견"],
  ["current_step", "현재 단계"],
  ["member_quote", "회원 한마디"],
  ["photo_slide", "사진"],
  ["sessions_label", "회차"],
  ["subtitle", "부제"],
  ["headline", "제목"],
  ["confirmed", "오늘 확인"],
  ["roadmap", "로드맵"],
  ["longterm", "중장기"],
  ["includes", "포함 내역"],
  ["services", "제공 서비스"],
  ["recommended", "추천"],
  ["points", "포인트"],
  ["steps", "단계"],
  ["cover", "표지"],
  ["bridge", "이어주기"],
  ["plans", "플랜"],
  ["feel", "느낄 변화"],
  ["vow", "다짐"],
  ["before", "이전"],
  ["after", "이후"],
  // salesbook 트레이너 관점 신규 키(diagnosis는 위 case_feedback 방어에 이미 있음).
  //   ⚠️ approach는 closing_approach·approach_tag(위쪽)보다 뒤라 긴 키 먼저 처리됨.
  ["approach", "접근"],
  ["how", "방법"],
];

function sanitizeText(s) {
  let out = s;
  for (const [k, v] of FIELD_TERMS) out = out.split(k).join(v);
  return out;
}

function sanitizeFieldNames(node) {
  if (typeof node === "string") return sanitizeText(node);
  if (Array.isArray(node)) return node.map(sanitizeFieldNames);
  if (node && typeof node === "object") {
    const o = {};
    for (const key of Object.keys(node)) o[key] = sanitizeFieldNames(node[key]); // 키는 보존
    return o;
  }
  return node;
}

// 줄표·강조 정리는 lib/tidyText(tidyDeep) — 다른 AI 라우트와 공용.

// ── JSON 추출 하드닝 (haiku가 ```json 여러 블록 + ---·**[...]** 구분자로 쪼개 뱉는 경우 대비) ──

/** 코드펜스·마크다운 구분자 라인 제거. */
function stripFencesAndMarkers(text) {
  return text
    .replace(/```+\s*json/gi, "")
    .replace(/```+/g, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^\s*\*\*\[[^\]\n]*\]\*\*\s*$/gm, "");
}

/** start 이후 '첫 완전한 최상위 객체'의 [본문, 끝인덱스]. 없으면 null.
    문자열 리터럴 속 중괄호·이스케이프는 무시. 균형이 안 맞으면(잘림 등) null. */
function balancedFrom(text, start) {
  const open = text.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return [text.slice(open, i + 1), i + 1];
  }
  return null;
}

function firstBalancedObject(text) {
  const r = balancedFrom(text, 0);
  return r ? r[0] : null;
}

/** 등장 순서대로 '모든 최상위 완전 객체'를 파싱해 반환(파싱 안 되는 조각은 스킵). */
function allBalancedObjects(text) {
  const out = [];
  let pos = 0, r;
  while ((r = balancedFrom(text, pos)) !== null) {
    try { out.push(JSON.parse(r[0])); } catch { /* 조각 스킵 */ }
    pos = r[1];
  }
  return out;
}

/** 최상위 객체들을 얕게(1-depth) union. 키가 하나라도 겹치면(오염 위험) null.
    ⚠️ 딥머지 아님 — 최상위 키만 합친다(중첩 재귀병합 금지). */
function guardedUnion(objs) {
  const union = {};
  for (const o of objs) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    for (const k of Object.keys(o)) {
      if (k in union) return null; // 키 충돌 → 병합 거부(disjoint일 때만 채택)
      union[k] = o[k];
    }
  }
  return union;
}

/* AI가 목록 칸을 목록이 아닌 값(문자열 · 객체 · 숫자)으로 보내면 화면의 .map · .filter가 죽는다(2026-10-12 점검).
   저장 전에 알려진 목록 칸만 배열로 맞춘다. 칸이 아예 없으면 건드리지 않는다(옛 형식 감지 등이 '없음'을 보므로).
   OBJ = 객체 목록(객체가 아닌 칸은 버림) · STR = 글 목록(숫자는 글로 · 나머지 버림) · ANY = 배열이기만 하면 됨. "*" = 배열의 각 칸. */
const LIST_PATHS = [
  ["cheat", "STR"], ["exercises", "OBJ"], ["exercises.*.alts", "OBJ"], ["session_plan", "OBJ"], ["proof.moves", "OBJ"],
  ["objection_defense", "OBJ"], ["closing_sequence.promise", "STR"], ["closing_sequence.fallback.homework", "OBJ"],
  ["lib_refs", "ANY"], ["data_gaps", "STR"],
  // 세일즈북 · 인바디 · 로드맵 · 체형
  ["goal.current_issues", "STR"], ["photo_slide.points", "STR"], ["today.items", "OBJ"],
  ["roadmap.steps", "OBJ"], ["roadmap.longterm", "OBJ"], ["roadmap.stages", "OBJ"], ["fork.stop", "STR"], ["fork.go", "STR"],
  ["plans", "OBJ"], ["plans.*.includes", "STR"], ["closing.services", "STR"],
  ["metrics", "OBJ"], ["findings", "OBJ"], ["diet", "STR"], ["lifestyle", "STR"], ["exercise", "STR"], ["stages", "OBJ"],
];
const isPlainObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
function toList(v, kind) {
  let a;
  if (Array.isArray(v)) a = v;
  else if (typeof v === "string") a = v.trim() ? [v] : [];
  else if (isPlainObj(v)) {
    const keys = Object.keys(v);
    a = keys.length && keys.every((k) => /^\d+$/.test(k)) ? Object.values(v) : [v];   // {"0":…,"1":…} → 배열 · 객체 하나 → [객체]
  } else a = [];
  if (kind === "OBJ") return a.filter(isPlainObj);
  if (kind === "STR") return a.filter((x) => typeof x === "string" || typeof x === "number").map(String);
  return a;
}
function coerceAt(node, parts, kind) {
  if (!isPlainObj(node) && !Array.isArray(node)) return;
  const [head, ...rest] = parts;
  if (head === "*") { if (Array.isArray(node)) for (const el of node) coerceAt(el, rest, kind); return; }
  if (!isPlainObj(node) || !(head in node)) return;
  if (rest.length === 0) { if (!Array.isArray(node[head]) || kind !== "ANY") node[head] = toList(node[head], kind); return; }
  coerceAt(node[head], rest, kind);
}
function coerceLists(o) {
  if (!isPlainObj(o)) return o;
  for (const [path, kind] of LIST_PATHS) coerceAt(o, path.split("."), kind);
  return o;
}

/** 모델 응답 텍스트 → JSON 객체 + data_gaps 기본값. requiredKeys를 주면 그 키가 모두 있어야 '완전'.
    1순위: 펜스·구분자 제거 후 단일 파싱(대개 한 객체를 감싼 것뿐).
    2순위: 실패/불완전 시 '첫 완전한 최상위 객체' 균형 추출.
    3순위: 그래도 불완전하면(haiku가 스키마를 여러 완전객체로 쪼갠 경우) guarded-union —
           비겹침(disjoint)일 때만 최상위 키 union. 겹치면 거부. union 결과도 완전성 재확인.
    완전한 객체를 못 얻으면 실패(부분객체 채택 안 함). */
function parseBrief(text, requiredKeys = []) {
  const cleaned = stripFencesAndMarkers(text);
  const complete = (o) =>
    o && typeof o === "object" && !Array.isArray(o) &&
    (requiredKeys.length === 0 || requiredKeys.every((k) => k in o));
  const finalize = (o) => {
    coerceLists(o);
    if (!Array.isArray(o.data_gaps)) o.data_gaps = [];
    return o;
  };

  // 1순위 — 펜스 제거 후 단일 파싱
  let single = null;
  try {
    const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
    if (s !== -1 && e > s) single = JSON.parse(cleaned.slice(s, e + 1));
  } catch { single = null; }
  if (complete(single)) return finalize(single);

  // 2순위 — 첫 완전한 최상위 객체
  const chunk = firstBalancedObject(cleaned);
  let first = null;
  if (chunk !== null) { try { first = JSON.parse(chunk); } catch { first = null; } }
  if (complete(first)) return finalize(first);

  // 3순위 — guarded-union (비겹침일 때만)
  const objs = allBalancedObjects(cleaned);
  if (objs.length > 1) {
    const union = guardedUnion(objs);
    if (complete(union)) return finalize(union);
  }

  if (single || first || objs.length) {
    throw new Error("스키마 불완전(다중블록 병합 실패 또는 필수 키 누락).");
  }
  throw new Error("AI 응답에서 완전한 JSON 객체를 찾지 못했습니다.");
}

// 트레이너 JWT로 그 계정 보유 장비 조회(RLS account 스코프). 실패·데모면 [].
async function fetchCenterMachines(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!url || !anon || !token) return [];
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.from("center_machine").select("name, kind, brand, spec");
  return Array.isArray(data) ? data : [];
}

// 대표 피드백(2026-10-03) — 대표가 아침 보고서에서 이 회원 건에 남긴 말(최근 3개). 트레이너 토큰 RLS(받는 트레이너 · 대표만 읽힘).
// 표가 아직 없거나(SQL 전) 실패하면 조용히 빈 배열 — 리포트 생성은 막지 않는다.
// 건강정보 동의 철회 확인(2026-10-05) — 가장 최근 health 동의 행이 agreed=false면 true.
//   철회한 회원의 불편 부위 · 부상 이력은 AI에 보내지 않는다(member_consent · 트레이너 토큰 RLS · 센터 범위).
//   동의 기록이 아예 없는 예전 회원은 그대로(등록 화면이 이제 동의 체크로 막음) · 표 없음/실패도 그대로(fail-open).
async function fetchHealthWithdrawn(request, memberId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!url || !anon || !token || typeof memberId !== "string") return false;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from("member_consent").select("agreed")
    .eq("member_id", memberId).eq("kind", "health").order("created_at", { ascending: false }).limit(1);
  if (error) return false;
  return data?.[0]?.agreed === false;
}

async function fetchOwnerFeedback(request, memberId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!url || !anon || !token || typeof memberId !== "string") return [];
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from("owner_feedback").select("body, ref_ymd, kind, created_at")
    .eq("member_id", memberId).order("created_at", { ascending: false }).limit(3);
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

function ownerFeedbackBlock(rows) {
  if (!rows.length) return "";
  const KO = { ot: "OT", rereg: "재등록", new: "신규 등록", other: "" };
  return `[★대표 피드백 — 이 회원 건에 대표가 남긴 말 · 반드시 반영]
${rows.map((f) => `- ${f.ref_ymd || String(f.created_at).slice(0, 10)} ${KO[f.kind] || ""} 건: "${String(f.body).slice(0, 400)}"`).join("\n")}
 → 이 피드백이 가리키는 점을 이번 리포트의 클로징 · 대사 · 30초 요약('오늘 꼭')에 녹여라. 피드백 문장을 그대로 옮기거나 대표를 언급하지는 마라(트레이너가 회원 앞에서 쓰는 대사다).`;
}

// 프롬프트용 장비 블록(소프트). 종류별 그룹 · 규격 병기 · 상한 120. 비면 ""(POST에서 이미 걸러 미호출).
function equipmentBlock(machines) {
  const list = (Array.isArray(machines) ? machines : []).slice(0, 120);
  if (!list.length) return "";
  const label = (k) => (k === "free_weight" ? "프리웨이트" : k === "bodyweight" ? "맨몸/도구" : "머신");
  const groups = {};
  for (const m of list) {
    if (!m || !m.name) continue;
    const g = label(m.kind);
    (groups[g] ||= []).push([m.brand, m.name].filter(Boolean).join(" ") + (m.spec ? `(${m.spec})` : ""));
  }
  const lines = Object.entries(groups).map(([k, arr]) => `- ${k}: ${arr.join(", ")}`).join("\n");
  return `[보유 장비 — 이 센터에 있는 장비] (아래를 최대한 활용해 구성. 목록이 아직 추가 중일 수 있으니, 목표에 더 맞으면 목록에 없는 머신·기구도 함께 제안 가능.)\n${lines}`;
}

// 화면에 보이는 실패 문구(해요체 · 개발자 용어 없이 · 2026-10-12).
const BAD_REQUEST = "요청을 처리하지 못했어요. 다시 시도해 주세요.";
const failMsg = (phase) => REPORT_PHASES.has(phase) ? "대본을 만들지 못했어요. 다시 시도해 주세요."
  : phase === "inbody" || phase === "posture" ? "분석을 만들지 못했어요. 다시 시도해 주세요."
  : phase === "roadmap" ? "로드맵 초안을 만들지 못했어요. 다시 시도해 주세요."
  : "세일즈북을 만들지 못했어요. 다시 시도해 주세요.";
// AI 호출 마감 — 플랫폼이 180초(maxDuration)에 함수를 끊기 전에 SDK가 먼저 포기해야 catch가 돌아
//   한도 자리를 '실패'로 닫는다(finishAi ok:false · 안 그러면 대기로 남음). 요청 시작부터 잰다.
const AI_DEADLINE_MS = 165_000;

export async function POST(request) {
  const tReq = Date.now();
  const auth = await requireTrainer(request);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI 연결이 아직 준비되지 않았어요. 예시로 보여 드려요." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }

  // 입력 상한(P1-12) — 심층방어. 이 라우트는 requireTrainer(인증+구독)로 이미 게이트되지만,
  // 프롬프트에 직삽입되는 필드에 길이·개수 상한이 없으면 인증 통과자가 거대한 본문으로
  // Sonnet 토큰을 폭주시킬 수 있다. 두 겹으로 막는다:
  //   ① 본문 전체 크기 — 정상 페이로드(회원+관찰+케이스 몇 건)는 수 KB다. 256KB는 넉넉한 상한.
  //     (voice-log P0-3의 크기 가드와 같은 결.) 직렬화 길이로 재는 건 원본보다 약간 크지만 충분.
  //   ② closingCases 개수 — secondPrompt가 전건 map + JSON.stringify(profile)로 펼치는 유일 배열.
  //     토큰이 배열 길이에 선형 비례하므로 개수 상한이 실질 방어다. caseTier 로직상 통상 한 자리수.
  const MAX_BODY_BYTES = 256 * 1024;
  const MAX_CLOSING_CASES = 20;
  let bodyBytes = 0;
  try { bodyBytes = JSON.stringify(body).length; } catch { bodyBytes = MAX_BODY_BYTES + 1; } // 순환참조 등 = 거부
  if (bodyBytes > MAX_BODY_BYTES) {
    return Response.json({ error: BAD_REQUEST }, { status: 413 });
  }

  const { phase, member: rawMember, report, ptContext, packages, favorites, inbody, posture, closingCases, caseTier, recommendedProgram, photoLabels, change, round, history, save, scriptRef, regPeriod } = body || {};
  if (phase !== "first" && phase !== "second" && phase !== "reregister" && phase !== "salesbook" && phase !== "reg_salesbook" && phase !== "first_salesbook" && phase !== "inbody" && phase !== "posture" && phase !== "roadmap") {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }
  // 건강정보 동의를 철회한 회원 = 불편 부위 · 부상 이력을 빼고 보낸다(프롬프트엔 '-'로 보임).
  const member = rawMember && typeof rawMember === "object" && (await fetchHealthWithdrawn(request, rawMember.id))
    ? { ...rawMember, pain: null, injury_history: null, health_screen: null }
    : rawMember;
  // 케이스 배열은 상한 개수만 통과시킨다(초과분은 조용히 버림 — 앞쪽이 우선순위 높은 케이스).
  const boundedCases = Array.isArray(closingCases) ? closingCases.slice(0, MAX_CLOSING_CASES) : closingCases;
  // n차 OT(2차+) — 이전 차수 기록. 차수 수는 현실적으로 한 자리수라 10개로 상한.
  const boundedHistory = Array.isArray(history) ? history.slice(0, 10) : [];
  const otRound = Number.isInteger(round) ? Math.min(Math.max(round, 2), 20) : 2;

  // AI 월 한도(2026-10-07 요금제) — 부르기 전에 자리를 잡는다. 같은 회원 · 같은 차수 다시 만들기는 새로 안 센다.
  const mid = typeof member?.id === "string" ? member.id : "";
  const once = mid || crypto.randomUUID();
  const usageKind = phase === "first" || phase === "second" ? "ot" : phase === "reregister" ? "rereg"
    : phase === "inbody" || phase === "posture" ? "inbody" : phase === "roadmap" ? "roadmap" : "salesbook";
  const unitKey = phase === "first" ? `ot:${once}:r1` : phase === "second" ? `ot:${once}:r${otRound}`
    : phase === "reregister" ? `rereg:${typeof save?.contractId === "string" ? save.contractId : once}`
    : usageKind === "inbody" ? `inbody:${once}:${inbody?.latest?.id || inbody?.latest?.measured_at || phase}`
    : phase === "roadmap" ? `roadmap:${once}` : `sb:${phase}:${once}`;
  // 저장 대상 확인(2026-10-13) — 대본 · 세일즈북을 저장할 회원 · 계약이 이 요청의 회원 것인지, AI 한도를 잡기 전에 본다.
  //   불일치 · 없는 회원 · 계약 · 다른 센터면 400(한도 · AI 호출 · 저장 모두 없음). 서버 이어 만들기(follow)도 이걸 통과한 요청에서만 돈다.
  if (!(await saveTargetOk((request.headers.get("authorization") || "").replace(/^Bearer /, "") || null, save, mid).catch(() => false))) {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }
  const admin = adminClient();
  const slot = await reserveAi(admin, { userId: auth.user?.id, kind: usageKind, unitKey, memberId: mid });
  if (!slot.ok) return quotaResponse(slot);
  // 베이직: 세일즈북은 이번 달 그 회원을 '준비'로 만든 경우에만(아니면 화면이 회원 정보로 만든 짧은 판을 쓴다)
  if (usageKind === "salesbook" && slot.accountId && (await tierOf(admin, slot.accountId)) === "basic"
      && !(await preparedThisMonth(admin, slot.accountId, mid))) {
    await finishAi(admin, slot.id, { ok: false });
    return Response.json({ error: "AI 세일즈북은 이번 달 이 회원의 OT · 재등록 준비를 만든 뒤 쓸 수 있어요.", code: "quota", group: "salesbook", tier: "basic" }, { status: 402 });
  }

  const model = REPORT_PHASES.has(phase) ? MODEL_REPORT : MODEL_FAST;
  // 별표한 운동자료 — 1차 · 2차+ · 재등록 공용(번호 [fn]이 lib_ref(s)로 돌아오니 화면도 같은 순서로 보낸다).
  const boundedFavs = Array.isArray(favorites) ? favorites.filter(Boolean).slice(0, 30) : [];
  // 화면에서 다시 만드는 세일즈북(2026-10-13 · 3단계) — 저장된 대본을 트레이너 토큰으로 읽어 같은 상담 방향(scriptBasis)을 넘긴다.
  //   2차 = save(kind ot · 회원 · 차수) · 재등록 = scriptRef(kind contract · 계약). 못 읽으면(옛 회원 · 대본 없음) 예전 프롬프트 그대로.
  const bookScript = phase === "salesbook" || phase === "reg_salesbook"
    ? await loadSavedScript((request.headers.get("authorization") || "").replace(/^Bearer /, "") || null, phase === "salesbook" ? save : scriptRef, member?.id).catch(() => null)
    : null;
  const bookBasis = scriptBasis(bookScript);
  const bookRp = recommendedProgram || bookScript?.recommended_program || null;   // 화면이 안 보냈으면 저장된 대본의 추천
  // 대본과 세일즈북이 같은 예상 기간을 쓰게(2026-10-13) — 빈도 후보는 프롬프트와 같은 함수 · 대본이 정한 weekly(없으면 예전 기준).
  const otFreqOpts = freqOptions({ applied: weeklyNum(member?.weekly_freq) });
  const otFreqFallback = paceFreqs(weeklyNum(member?.weekly_freq));
  const regAvg = avgOf(phase === "reregister" ? ptContext?.weekly_frequency : change?.journey?.weekly_frequency);
  const regFreqOpts = freqOptions({ avg: regAvg });
  const regFreqFallback = regAvg ? regFreqOpts.slice(0, 1) : paceFreqs(null);
  // 이번 계약 기간(B+C · 2026-10-13) — 재등록 대본 · 서버 이어 만드는 세일즈북 · 화면 재생성 세일즈북 모두 서버가 기록에서 계산한 한 값.
  //   화면이 보낸 regPeriod · ptContext.this_period는 쓰지 않는다. 계산 못 하면(조회 실패 · 이 회원 계약 아님) 그 숫자는 빼고 만든다.
  const periodContractId = phase === "reregister" && save?.kind === "contract" ? save.contractId
    : phase === "reg_salesbook" && scriptRef?.kind === "contract" ? scriptRef.contractId : null;
  const srvPeriod = periodContractId
    ? await loadContractPeriod((request.headers.get("authorization") || "").replace(/^Bearer /, "") || null, mid, periodContractId).catch(() => ({ ok: false }))
    : null;
  const periodForBook = srvPeriod?.ok && srvPeriod.period ? cleanPeriod({ round: srvPeriod.round, ...srvPeriod.period }) : null;
  const bookPeriod = phase === "reg_salesbook" ? periodForBook : null;
  // 재등록 대본에 넘기는 ptContext — this_period · round는 서버 값으로 바꾼다(계산 실패면 this_period 없음 + '확인 못 함' 표시).
  //   대본과 세일즈북이 글자까지 같은 숫자를 쓰게 둘 다 cleanPeriod를 거친 값(소수 한 자리 등)을 쓴다.
  const regCtx = phase !== "reregister" ? ptContext
    : srvPeriod?.ok ? { ...(ptContext || {}), round: srvPeriod.round, this_period: periodForBook ? (({ round: _r, ...rest }) => rest)(periodForBook) : null }
    : { ...(ptContext || {}), this_period: null, ...(srvPeriod ? { period_unavailable: true } : {}) };
  // 인바디(2026-10-13 · 선택 근거) — 2차 이상 대본 · 2차 세일즈북만. 동의 철회 · 확인 불가면 보내지 않는다. AI 호출은 늘지 않는다.
  const authToken = (request.headers.get("authorization") || "").replace(/^Bearer /, "") || null;
  const ibRaw = (phase === "second" || phase === "salesbook") && mid ? await loadInbodyRaw(authToken, mid, { withAnalysis: INBODY_TO_AI }).catch(() => null) : null;
  const hasInbody = Boolean(ibRaw?.rows?.length);   // 이 회원에게 실제 인바디 기록이 있나 — 세일즈북 '앱이 늘 하는 것'에 인바디를 넣을지만(수치는 여기서 안 보냄)
  // 인바디 수치 · 저장된 분석을 AI 근거로 — 스위치(INBODY_TO_AI)가 켜져 있고 건강정보 동의 철회 · 확인 불가가 아닐 때만. 지금은 꺼져 있어 늘 null.
  const inbodyNow = INBODY_TO_AI && ibRaw && !(await healthBlockedForInbody(authToken, mid).catch(() => true)) ? inbodyForSales(ibRaw) : null;
  const basePrompt =
    phase === "first" ? firstPrompt(member, packages, boundedFavs)
    : phase === "second" ? secondPrompt(member, report, boundedCases, caseTier, packages, otRound, boundedHistory, boundedFavs, inbodyNow)
    : phase === "reregister" ? reregisterPrompt(member, regCtx, packages, boundedFavs)
    : phase === "salesbook" ? salesbookPrompt(member, report, bookRp, packages, photoLabels, otRound, boundedHistory, bookBasis, inbodyNow, hasInbody)
    : phase === "reg_salesbook" ? regSalesbookPrompt(member, change, bookRp, packages, photoLabels, { basis: bookBasis, period: bookPeriod })
    : phase === "first_salesbook" ? firstSalesbookPrompt(member, report, recommendedProgram, packages)
    : phase === "inbody" ? inbodyPrompt(member, inbody)
    : phase === "roadmap" ? roadmapPrompt(member, ptContext)
    : posturePrompt(member, posture);
  // 장비 등록됐으면 '우선 활용(소프트)'로 앞에 붙임. 0개(미등록)면 안 붙여 종전대로. salesbook 제외(회원 대면엔 불필요).
  const centerMachines = (phase === "salesbook" || phase === "reg_salesbook" || phase === "first_salesbook" || phase === "inbody" || phase === "posture" || phase === "roadmap") ? [] : await fetchCenterMachines(request).catch(() => []);   // 실패해도 대본은 만든다(자리만 잡고 멈추지 않게 · 2026-10-08)
  // 대표 피드백 — 리포트 3종(first · second · reregister)만.
  const fbBlock = REPORT_PHASES.has(phase) ? ownerFeedbackBlock(await fetchOwnerFeedback(request, member?.id).catch(() => [])) : "";
  const withFb = fbBlock ? `${basePrompt}\n\n${fbBlock}` : basePrompt;
  const prompt =
    (centerMachines.length === 0)
      ? withFb
      : `${equipmentBlock(centerMachines)}\n[기구 활용] 운동 구성은 위 [보유 장비]를 우선 활용하되, 목표에 더 맞는 장비가 목록에 없으면 그것도 함께 알려줘라(목록은 아직 추가 중일 수 있음). 규격의 중량 범위는 참고만 — 숫자 처방(세트·횟수·중량)은 여전히 금지, 방향까지만.\n\n${withFb}`;
  // ① 확정 스키마 출력 ~5.5k 토큰 → 8192 필수(4096이면 JSON 잘려 파싱 불가). ③(Sonnet)은 5120,
  // 단 D-3 케이스 동봉 시 case_feedback ~300~500토큰 더 → 6144(잘림 방지).
  // salesbook은 거절5·클로징시퀀스 없어 가볍지만 한국어 총량 은근 커 4096(꼬리 잘림 마진 · max는 상한이라 과금 무관).
  // Opus 5.5는 adaptive thinking(끄기 불가) — 생각 토큰이 max_tokens 안에서 쓰이므로 리포트는 여유를 크게(상한일 뿐 과금 무관).
  const thinkBudget = REPORT_PHASES.has(phase) ? 8000 : 0;
  const maxTokens = thinkBudget + (
    phase === "first" ? 8192
    : phase === "inbody" || phase === "posture" || phase === "roadmap" ? 3072
    : phase === "salesbook" || phase === "reg_salesbook" || phase === "first_salesbook" ? 4096
    : (phase === "second" && boundedCases?.length ? 7168 : 6144)); // 2026-10-02 클로징 이유·가격 이유·오늘 안 되면(숙제) 추가로 출력이 길어짐

  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "") || null;
  // 생성+저장을 한 작업으로 — after()에 걸어 두면 브라우저가 끊겨도(다른 화면·창 닫기) 플랫폼이 끝까지 돌린다.
  const t0 = Date.now();
  const job = (async () => {
    const anthropic = new Anthropic({ apiKey });
    // posture: 회원 체형 사진을 비전으로 직접 관찰(이미지 블록 · 서명 URL 소스 · 최대 3장).
    let userContent = prompt;
    if (phase === "posture" && Array.isArray(posture?.photoUrls)) {
      const imgs = posture.photoUrls
        .filter((p) => p && typeof p.url === "string" && /^https:\/\//.test(p.url))
        .slice(0, 3)
        .map((p) => ({ type: "image", source: { type: "url", url: p.url } }));
      if (imgs.length) userContent = [...imgs, { type: "text", text: prompt }];
    }
    const req = {
      model,
      max_tokens: maxTokens,
      system: (phase === "salesbook" || phase === "reg_salesbook" || phase === "first_salesbook" || phase === "inbody" || phase === "posture" || phase === "roadmap") ? SALESBOOK_PREAMBLE : PREAMBLE,
      messages: [{ role: "user", content: userContent }],
    };
    req.thinking = thinkingFor(model);

    let msg;
    // 마감(AI_DEADLINE_MS)까지 남은 시간만큼만 기다린다 — signal은 SDK 재시도까지 통째로 끊는다.
    const left = Math.max(5_000, AI_DEADLINE_MS - (Date.now() - tReq));
    try { msg = await anthropic.messages.create(req, { timeout: left, signal: AbortSignal.timeout(left) }); }
    catch (e) { await finishAi(admin, slot.id, { ok: false, model }); throw e; }
    const textOut = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    // first는 필수 키를 넘겨 스키마 완전성까지 파서가 보장(부분객체·다중블록 방어).
    // second는 별도 스키마라 키 미지정(1순위 단일 파싱 — 기존 동작 유지, 회귀 없음).
    const REQUIRED_FIRST = ["member_read", "opening", "exercises", "sales_metaphor", "closing_sequence", "objection_defense"];
    const REQUIRED_SECOND = ["member_read", "recall", "session_plan", "proof", "sales_metaphor", "closing_sequence", "objection_defense"];
    const REQUIRED_REREG = ["member_read", "why_now", "session_flow", "sales_metaphor", "closing_sequence", "objection_defense"];
    const REQUIRED_SALESBOOK = ["cover", "goal", "confirmed", "photo_slide", "roadmap", "plans", "closing"];
    const REQUIRED_REG_SALESBOOK = ["cover", "journey", "change", "roadmap", "fork", "plans", "closing"];
    const REQUIRED_FIRST_SALESBOOK = ["cover", "goal", "today", "roadmap", "closing"];
    const REQUIRED_INBODY = ["headline", "metrics", "diet", "lifestyle", "exercise", "why_now"];
    const REQUIRED_ROADMAP = ["title", "stages"];
    const REQUIRED_POSTURE = ["headline", "findings", "exercise", "lifestyle", "why_now"];
    const reqKeys = phase === "first" ? REQUIRED_FIRST : phase === "second" ? REQUIRED_SECOND : phase === "reregister" ? REQUIRED_REREG : phase === "salesbook" ? REQUIRED_SALESBOOK : phase === "reg_salesbook" ? REQUIRED_REG_SALESBOOK : phase === "first_salesbook" ? REQUIRED_FIRST_SALESBOOK : phase === "inbody" ? REQUIRED_INBODY : phase === "posture" ? REQUIRED_POSTURE : phase === "roadmap" ? REQUIRED_ROADMAP : [];
    let brief;
    try {
      let parsed = tidyDeep(sanitizeFieldNames(parseBrief(textOut, reqKeys)), REPORT_PHASES.has(phase));
      // 재등록 안전망(2026-10-13) — 출석 절대 표현은 '꾸준히'로 · 혜택(sweetener)은 확인된 혜택 정보를 받는 곳이 아직 없어 비운다(AI가 만든 혜택 약속 방지).
      if (phase === "reregister" || phase === "reg_salesbook") parsed = softenAttendance(parsed);
      if (phase === "reregister" && typeof parsed.sweetener === "string") parsed.sweetener = "";
      if (phase === "second") parsed = normalizeWeekly(parsed, otFreqOpts);
      if (phase === "reregister") parsed = normalizeWeekly(parsed, regFreqOpts);
      // 화면에서 다시 만드는 세일즈북도 플랜 숫자는 실제 상품 설정으로(2026-10-13 · 서버 이어 만들기와 같은 함수).
      const aligned = phase === "salesbook" ? neutralPhotoSlide(alignPlans(parsed, bookRp, packages, planFreqs(bookRp, otFreqOpts, otFreqFallback)), photoLabels)
        : phase === "reg_salesbook" ? alignPlans(parsed, bookRp, packages, planFreqs(bookRp, regFreqOpts, regFreqFallback)) : parsed;
      brief = attachLibSnapshots(attachPkgSnapshots(aligned, packages), boundedFavs);
      if (phase === "salesbook") brief = guardSalesbook(brief, packages, bookBasis, { hasInbody, moves: obsMoveNames(report, boundedHistory) });   // 2차 세일즈북 약속 · 가격 안전망(2026-10-13)
    }
    catch (e) { await finishAi(admin, slot.id, { ok: false, model, usage: msg.usage }); throw e; }   // 결과가 깨지면 안 셈(원가는 기록)
    await finishAi(admin, slot.id, { ok: true, model, usage: msg.usage });
    console.log(`[ot-brief] 생성 완료 · phase=${phase} · model=${model} · ${Math.round((Date.now() - t0) / 1000)}s · 출력 ${msg.usage?.output_tokens ?? "?"}토큰`);
    let savedId = null;
    try { savedId = await saveResult(token, phase, save, brief, model); }
    catch (se) { console.error("[ot-brief] 저장 실패 · phase=" + phase + ":", se?.message || se); }
    return { brief, savedId };
  })();
  // 1차 리포트를 저장했으면 이어서 1차 세일즈북도 만들어 둔다 — 수업 끝 클로징 때 기다림 없이 바로 열리게(2026-10-02).
  //   응답은 1차 리포트만 기다린다. 세일즈북은 뒤에서(after) 끝까지 돌고 같은 1차 행에 저장된다(순서대로라 저장 충돌 없음).
  //   2차도 같다(2026-10-02 대표: 세일즈북은 OT 화면이 아니라 홈 › 세일즈북에서 보여준다) — 2차 리포트 저장 뒤 2차 세일즈북을
  //   이어서 만들어 같은 차수 행에 저장(트레이너가 짠 장 구성은 유지). 사진 장 재료(photoLabels)는 화면이 같이 보낸다.
  //   (2026-10-11 대표) 1차는 회원별 세일즈북 대신 '내 회원님 변화 모음집'(한 번 만들어 계속 씀) → 1차 이어 만들기는 끔 · 2차만.
  //   (2026-10-11) 재등록도 같다 — 대본의 클로징이 세일즈북을 넘기며 말하게 바뀌어서, 대본 저장 뒤 재등록 세일즈북을 이어서
  //   만들어 같은 계약 행(report.reg_salesbook)에 저장. 숫자(change) · 사진 장 재료(photoLabels)는 화면이 같이 보낸다.
  const followRereg = phase === "reregister" && save?.kind === "contract" && change && typeof change === "object";
  const follow = (phase === "second" || followRereg) && save ? job.then(async ({ brief, savedId }) => {
    if (!savedId) return;
    // 남은 시간이 모자라면 이어 만들기를 건너뛴다(플랫폼이 끊으면 한도 자리가 대기로 남는다 · 화면이 나중에 다시 만든다).
    const leftFollow = tReq + 175_000 - Date.now();
    if (leftFollow < 20_000) { console.log("[ot-brief] 세일즈북 이어 만들기 건너뜀 · 시간 부족"); return; }
    const t1 = Date.now();
    const anthropic = new Anthropic({ apiKey });
    const isFirst = phase === "first";
    const isRereg = phase === "reregister";
    const sbSlot = await reserveAi(admin, { userId: auth.user?.id, kind: "salesbook", unitKey: `sb:follow:${once}`, memberId: mid });
    if (!sbSlot.ok) return;   // 하루 상한 · 남의 회원(2026-10-08) — 이어 만들기는 조용히 건너뛴다(화면이 처음 열 때 다시 만든다)
    // 실패하면 예약 자리를 '실패'로 닫는다(원가만 남고 안 셈 · 2026-10-11 점검: 예전엔 대기로 남았다). 결과가 깨져도 실패로.
    let msg = null, sbOut;
    try {
      msg = await anthropic.messages.create({
        model: MODEL_FAST, max_tokens: 4096, system: SALESBOOK_PREAMBLE, thinking: thinkingFor(MODEL_FAST),
        messages: [{ role: "user", content: isRereg
          ? regSalesbookPrompt(member, change, brief?.recommended_program, packages, photoLabels, {
              basis: scriptBasis(brief),
              // 두 번째 이상 재등록 — 대본에 넣은 이번 계약 기간(서버가 기록에서 계산)을 세일즈북도 같이 받는다
              period: periodForBook,   // 대본에 넣은 것과 같은 서버 계산값(화면이 보낸 숫자 아님)
            })
          : isFirst
          ? firstSalesbookPrompt(member, brief, brief?.recommended_program, packages)
          : salesbookPrompt(member, report, brief?.recommended_program, packages, photoLabels, otRound, boundedHistory, scriptBasis(brief), inbodyNow, hasInbody) }],
      }, { timeout: leftFollow, signal: AbortSignal.timeout(leftFollow) });
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const keys = isRereg ? ["cover", "journey", "change", "roadmap", "fork", "plans", "closing"]
        : isFirst ? ["cover", "goal", "today", "roadmap", "closing"] : ["cover", "goal", "confirmed", "photo_slide", "roadmap", "plans", "closing"];
      // 플랜 장 = 방금 저장한 대본의 추천 · 대안 패키지와 실제 상품 설정으로(2026-10-13 · alignPlans)
      const sbAligned = alignPlans(tidyDeep(sanitizeFieldNames(parseBrief(text, keys)), false), brief?.recommended_program, packages,
        isRereg ? planFreqs(brief?.recommended_program, regFreqOpts, regFreqFallback) : planFreqs(brief?.recommended_program, otFreqOpts, otFreqFallback));
      sbOut = attachPkgSnapshots(isRereg ? softenAttendance(sbAligned) : neutralPhotoSlide(sbAligned, photoLabels), packages);
      if (!isRereg && !isFirst) sbOut = guardSalesbook(sbOut, packages, scriptBasis(brief), { hasInbody, moves: obsMoveNames(report, boundedHistory) });   // 2차 세일즈북 약속 · 가격 안전망(2026-10-13)
    } catch (e) {
      await finishAi(admin, sbSlot.id, { ok: false, model: MODEL_FAST, usage: msg?.usage });
      throw e;
    }
    await finishAi(admin, sbSlot.id, { ok: true, model: MODEL_FAST, usage: msg.usage });
    if (isRereg) await saveResult(token, "reg_salesbook", { kind: "contract", contractId: save.contractId, meta: {} }, sbOut, MODEL_FAST);
    else await saveResult(token, isFirst ? "first_salesbook" : "salesbook",
      { kind: "ot", memberId: save.memberId, round: isFirst ? 1 : otRound, meta: {} }, sbOut, MODEL_FAST);
    console.log(`[ot-brief] ${isRereg ? "재등록" : isFirst ? "1차" : otRound + "차"} 세일즈북 이어서 생성 · ${Math.round((Date.now() - t1) / 1000)}s`);
  }).catch((e) => console.error("[ot-brief] 세일즈북 이어서 생성 실패:", e?.message || e)) : null;
  after(() => Promise.all([job.catch(() => {}), follow]));

  try {
    const { brief, savedId } = await job;
    const headers = { "x-ai-model": model, ...(savedId ? { "x-saved-row": String(savedId) } : {}) };
    return Response.json(brief, { headers });
  } catch (e) {
    console.error("[ot-brief] 생성 실패 · phase=" + phase + ":", e?.message || e);
    return Response.json({ error: failMsg(phase) }, { status: 502 });
  }
}

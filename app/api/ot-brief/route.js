// app/api/ot-brief/route.js
// -----------------------------------------------------------------------------
// OT 여정 AI 지원 (서버 전용). 순수 생성기 — 캐시는 클라이언트가 담당.
//   phase "first"  → ① 1차 지원 (sonnet): 기본정보+내 패키지 → 6단계 arc·movement_cues·추천 프로그램·클로징 4단계·거절 4종
//   phase "second" → ③ 2차 지원 (sonnet): 1차 관찰 → 등록 당위성 브리핑·arc·closing 3분기·objections
// system = 가드레일 프리앰블(스파링 파트너/환각 금지/윤리/출력규칙, 문자 그대로).
// 키 미설정·API 실패·JSON 파싱 실패 → 명확한 상태코드 (프론트가 데모 폴백 판별).
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60; // ③ Sonnet 생성이 최대 ~1분 → Vercel 함수 타임아웃 상향

const MODEL_SECOND = "claude-sonnet-5";

// §5 가드레일 프리앰블 — 도메인 분리(운동=스파링 / 세일즈=실전 클로저). 톤 전체의 뿌리라 신중.
const PREAMBLE = `너는 피트니스 트레이너의 파트너다. 도메인에 따라 두 얼굴을 갖는다.

[★도메인 분리 — 이 프롬프트의 핵심 원칙]
- 운동(방법·방향·자각·큐잉·평가)에서는 '스파링 파트너'다. 정답 대본을 주지 말고 근거·방향을
  제시해, 트레이너가 자기 역량으로 채우고 성장하게 한다. 여기서 대본을 주면 트레이너를 하향평준화시킨다.
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
- 허용(강하게 OK): 회원 '본인 데이터'로 말하기 / 사실 기반 손실 프레이밍("지금 멈추면 원점") /
  "혼자서는 이 세팅을 못 잡는다"(사실인 책임의 말) / 확신 있는 단일 추천 · 가정 종결.
- 금지(효과에도 역효과): 허위 긴급성("오늘만 이 가격"), FOMO 남발, 죄책감 유발, 회원 소진
  강요(지쳐서 등록), 의료·완치·치료 표현. — 신뢰가 깨지면 재등록·소개가 무너진다.
- 강한 클로징의 원천은 압박이 아니라 "이 트레이너가 나를 정확히 이해했다"는 공감이다.

[출력 규칙]
- 운동 파트: 대본 통째 금지 — intent(왜)·direction(무엇을) 중심, example(예시)은 '발판'이다.
  숫자 처방(각도·템포·세트·중량) 금지, 움직임 '방향'까지만("전방 힙힌지로 둔근 개입").
- 세일즈 파트: 반대다 — 바로 말할 실전 멘트를 '선명하게' 준다(흐린 '예시'로 물러서지 말 것).
  확신 있게, 결과가 나오게. 조작성 바닥선(위 윤리)만 지킨다.
- 반드시 지정된 JSON 스키마만 출력. 설명·마크다운·코드펜스 금지.`;

const g = (v) => (v == null || v === "" ? "없음" : v);

// ── ① firstPrompt — 사전무장 컨닝페이퍼(4블록). 세일즈 클로징 극대화 · 3분전 스캔용. ──
function firstPrompt(member, packages) {
  const m = member || {};
  const machines = Array.isArray(m.machines) ? m.machines.join(", ") : g(m.machines);
  const pkgs = Array.isArray(packages) ? packages.filter(Boolean) : [];
  const pkgBlock = pkgs.length
    ? pkgs.map((p, i) => {
        const per = p.sessions ? Math.round(p.price / p.sessions) : null;
        return `[${i}] name=${g(p.name)} · sessions=${p.sessions ?? "기간제"} · duration=${g(p.duration_label)} · price=${Number(p.price).toLocaleString("ko-KR")}원${per ? ` · 회당=${per.toLocaleString("ko-KR")}원` : ""}${p.note ? ` · note=${p.note}` : ""}`;
      }).join("\n")
    : "등록된 패키지 없음";
  return `[상황·대전제] 1차 OT 입장 3분 전. 이 출력의 유일한 목적 = 이 회원의 '등록(클로징) 확률 극대화'다.
트레이너는 이걸 30초~1분에 훑어 머리에 넣고 폰을 주머니에 넣는다. '참고 설명'이 아니라 '바로 외워
바로 말할 완성 대사'로 써라. 추상 지침·개발자용 매핑 설명 금지.

[이 국면 특칙 — 대본 수위] 세일즈(오프닝·비유·클로징·거절)뿐 아니라 운동 파트도 '회원에게 그대로 말할
실제 대사'까지 구체적으로 준다. 단 아래는 여전히 절대 금지:
 - 숫자 처방(세트·횟수·각도·중량·템포·시간). 운동은 '방향 + 짚어줄 말'까지, 숫자는 빼라.
 - 의료 단정(치료·완치·진단). 통증은 '불편/부담' 수준 표현까지만.

[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, residence=${g(m.residence)},
               mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}, machines=${machines}
[OT 사전 문진 — 회원이 등록 때 작성(있는 것만 활용, 없으면 무시)]
 목표시점/계기=${g(m.goal_deadline)}, 원하는페이스=${g(m.training_pace)}, 부상·수술=${g(m.injury_history)},
 운동경험=${g(m.exercise_level)}, 예전중단이유=${g(m.quit_reason)}, 받아본유료운동=${g(m.past_exercise)},
 가능빈도·시간=${g(m.availability)}, 하루활동량=${g(m.activity_level)}, 바라는점=${g(m.member_note)}
아직 관찰 전이다 — 신체 판단은 '~일 가능성' 가설 톤. 없는 관찰·수치·에피소드 창작 금지. 단 오프닝·
비유·거절 대사는 세일즈 기술이라 확신 있게 완성해도 된다(사실 왜곡이 아니므로).

[내 PT 패키지] (★이 목록에서만 추천. 없는 패키지·가격·세션수 창작 금지. [n]=참조번호)
${pkgBlock}

[★운동목적(goal) = 최우선 렌즈] goal이 4블록 전부의 중심축이다.
 - 통증개선/불편해소 → 불편 부위를 전면, 그 해소로 엮는다.
 - 외형/체중감량/바디라인 → 체형·라인·자신감을 전면, pain은 보조.
 - 건강/체력/활력 → 컨디션·에너지를 전면.  - 벌크업/근육 → 근성장·볼륨·자세를 전면.
 ⚠️ goal과 무관하게 pain만 물지 말 것. pain은 goal이 통증개선일 때만 주인공.

[사전 문진 활용 — 클로징 근거 강화]
 - goal_deadline(시점): session_logic 기간 역산과 '왜 지금'에 최우선 반영("데드라인까지 N개월이라 주2회 필수"). 없으면 일반 기간 논리.
 - availability(가능 빈도): recommended_program.frequency의 현실 빈도 근거로, 목표에 부족하면 그 격차를 objection_defense의 time(시간부족) 선제 방어로 연결.
 - quit_reason(예전 중단 이유): objection_defense.doubt와 클로징 손실 프레이밍의 직접 근거("혼자 하다 ○○로 멈추셨잖아요 — 이번엔 그 지점을 제가 잡아드려요"). 없는 이유 창작 금지.
 - injury_history·exercise_level·activity_level: target_exercise 동작 선택·난이도·안전(부상 부위 우회)과 비유 소재로. injury_history 있으면 의료경계 유지.
 - training_pace·member_note: 오프닝·전반 톤 보조(있을 때만).

[★재정·투자 신호 → 세션·단가 제시 강도] job·past_exercise·training_pace로 지불 여력·투자 의향을 읽어라.
 - 여유·의향 높아 보이면(안정 직군·과거 PT/필라테스 경험·'제대로/집중' 선택): recommended_program에서 위축되지 말고 목표에 필요한 만큼 넉넉한 회차의 패키지(pick_ref)를 확신 있게 골라라. session_logic도 당당하게(할인·최소량으로 미리 물러서지 말 것).
 - 제약 커 보이면(신호 부재·'가볍게 시작'): 최소 필요량부터 제안, 이후 확장 여지 남김.
 - ⚠️ 이 판단은 pick_ref 선택과 session_logic '톤'에만 반영. 회원에게 '여유 있어 보인다/돈' 식 재정 언급은 값 텍스트에 절대 금지.

[컨닝페이퍼 4블록 — 트레이너가 읽는 순서]

① opening(오프닝 — 첫 만남 긴장 풀기): 회원의 직업·거주·나이·목표 같은 '일상 소재'로 가볍게 문을 여는
   완성 대사 1개. 날씨 같은 무난한 소재도 좋다. 세일즈 냄새 0, 사람 대 사람의 라포.
   - line: 그대로 말할 첫 대사("○○님, …") 1~2문장.  - why: 이게 여는 것(긴장 완화·신뢰) 1문장.

② session_plan(오늘 수업 운동 구성 — '무엇을 시킬지' 구체적으로): 오늘 1차 OT에서 이 회원에게 실제로
   시킬 운동을 순서대로 3~5개 구성하라. 회원 goal·pain·기본정보(관찰 전이라 가설)에서 도출하고, 아래 '타겟
   운동(증거)'이 잘 터지도록 빌드업되게 짜라(가벼운 활성·준비 → 핵심 → 증거로 자연히 이어짐). 이게 트레이너가
   '오늘 뭘 시킬지'를 바로 아는 실전 구성이다.
   ★각 운동은 '이름 있는 구체 동작 + 한 줄 큐/세팅'으로. 고정 구성 반복 금지, goal·pain으로 개인화(직업
   없어도). 숫자 처방(세트·횟수·각도·중량·템포) 금지 — 무엇을·어떤 방향으로·왜인지까지만.
   각 항목: exercise(구체 동작 + 한 줄 세팅) / point(왜 시키나 or 핵심 큐 1문장).

③ target_exercise(타겟 운동 & 리액션 — 세일즈의 '증거' 만들기): 위 수업 구성 중/직후 터뜨릴 결정적 체감 순간이다. 목적은 운동 처방이 아니라, 회원이 '어? 되네/편해지네'를 그 자리에서 부인할 수 없이 체감해 'PT가 필요하구나'를 스스로 느끼게 하는 것.
   ★증거 동작 2개(moves 배열). 각 동작 필수 — (a)이름 있는 구체 동작으로 콕 집을 것 (b)차이가 확 느껴질 것.
   - ★★동작은 반드시 '이 회원의 goal·pain·injury_history·exercise_level'에서 도출하라. 회원마다 목적·
     불편이 다르면 동작도 달라야 한다. 특정 고정 동작을 습관적으로 반복하지 마라 —
     · goal이 체형·근력이면 그 타겟 부위를 직접 체감시키는 동작
     · pain이 있으면 그 부위를 우회·완화시켜 '안 아프게 되네' 체감을 주는 동작
     · goal이 체력·건강이면 전신 협응·호흡·자세로 '몸이 가벼워지는' 체감
     · 부상 부위(injury_history)는 피하거나 우회, 초보(exercise_level 처음)면 쉬운 동작으로.
   - ★직업(job)이 없거나 무직·백수·학생이어도 goal·pain으로 충분히 개인화하라. 직업 정보가 비었다고
     매번 같은 일반 동작(목·어깨·흉추류 등)으로 도망가지 마라 — 직업은 개인화의 여러 축 중 하나일 뿐이다.
   - ★차이가 극적인 동작 — 'before→after' 체감 실험으로: 먼저 시켜 지금 상태를 느끼게 → 큐·세팅 하나
     잡아줌 → 다시 시키면 확 달라짐. 그 큐가 회원이 혼자선 못 잡는 지점이다.
   - ★2개는 서로 겹치지 않게: 1번=회원의 주 목적/불편 직격, 2번=다른 각도(연관 부위·기능)로 쐐기.
   - 숫자 처방(세트·횟수·각도·템포·중량) 금지 — 동작은 구체적으로, 숫자는 비워라.
   moves[] 각 항목:
   - exercise: 콕 집은 구체 동작 이름 + 어떻게 시키는지 한 줄(숫자 없이).
   - target_reaction: 회원이 느낄 '분명한' 차이를 before→after 대비로(예: "처음엔 뻐근·제한 → 세팅 후 확 트임").
   - point_it_out: 그 차이가 난 순간 그대로 말할 실제 대사 — before→after를 회원이 인정하게 묻고
     ("아까랑 다르죠?"), '이건 혼자선 이 세팅을 못 잡는다'를 자연스럽게 심어라. 1~2문장.
   그리고 so_what(moves 밖 · 2개 공통): 두 체감을 묶어 'PT를 받는 게 낫겠다'는 회원 스스로의 결론으로
   잇는 한 줄(압박 아님·사실 기반).

④ sales_metaphor(세일즈 비유 — 회원 세계 언어): 회원의 직업·일상·목표에서 끌어온 비유 하나로 '지금
   안 하면/함께 하면'을 그림처럼. 운동·기계 클리셰("브레이크-액셀") 금지.
   - metaphor: 그대로 말할 비유 대사 1~2문장.  - bridge: 비유→등록 필요성으로 잇는 한 줄.

⑤ closing_line(클로징 한마디): 오늘 체감을 근거로 한 '가정 종결' 한 문장. '등록하세요'(판매 동사) 금지 →
   "다음 주부터 이렇게 가시죠" 결. 긴급성은 사실 기반 손실만.

⑥ objection_defense(거절 선제 방어 5종): 아래 5개 각각 미리 무장. 반박이 아니라 '공감으로 빗장 풀고
   세일즈로 다시 끌기'. reason 키 고정(5개 전부 · 각 1개):
     price(가격 부담) · hesitation(생각해볼게요·망설임) · doubt(효과·필요성 의심) ·
     time(시간 부족·바빠서) · compare(타 센터 비교 — "가격 비교하고 올게요/다른 데서도 OT 받아볼게요").
   - trigger: 이 거절이 나올 신호(회원이 흔히 하는 말) 1문장.
   - defense: 공감으로 걱정 풀고 바로 잇는 세일즈 무브 1~2문장.
   - line: 그 자리에서 그대로 말할 실제 대사("○○님, …") 1문장.
   ⚠️ compare는 경쟁사 비방·가격 맞대응 금지 → '오늘 이미 당신 몸에서 확인한 것'이라는 관계·데이터
     선점 우위로("다른 데선 0부터 다시 파악해야 해요. 저는 오늘 이미 ○○을 봤고요").
   ⚠️ 허위 긴급성·공포·죄책감 금지(PREAMBLE 상속).

[recommended_program — 추천 프로그램 + '왜 이 횟수' 근거] 위 [내 PT 패키지]에서 이 회원에게 가장 맞는
   1개(pick_ref)를 확신 있게 골라라. 클로징 직전에 회원에게 '세션수·금액'을 제시할 때 쓸, 반박 안 되는
   근거를 만드는 게 이 블록의 핵심 — "왜 이 횟수를 받아야 하는지"를 회원 상황에서 역산해 준다.
   - why_fit: 이 패키지가 이 회원에게 맞는 이유(목적·불편·직업·나이). 2문장 이내.
   - frequency: 권장 주간 빈도(예: "주 2회")와 '왜 그 빈도인지' 근거(회복시간 확보·습관형성 최소빈도·
     목표 속도 등 회원 상황 기반). 1문장.
   - duration: 권장 총 기간(예: "약 3개월")과 '왜 그 기간인지' 근거(눈에 띄는 변화까지 필요한 시간 등). 1문장.
   - session_logic: frequency × duration으로 총 세션수를 역산해 'pick_ref 패키지의 회차가 왜 딱 맞는지'를
     한 줄로 잇는다(예: "주 2회로 약 3개월이면 24~30회라, 이 패키지 회차가 목표에 딱 맞습니다").
     ★여기 나오는 세션수는 반드시 네가 고른 pick_ref 패키지의 실제 sessions 값에 맞춰 역산하라(새 숫자
     창작 금지). ★단 '가격(원)'은 값 텍스트에 절대 쓰지 마라 — 금액은 앱이 목록에서 채운다.
     ※ 패키지가 '기간제'(세션수 없음)면 session_logic은 '왜 이 기간이 필요한지'로 대체한다.
   - alt_ref: 결이 다른 대안 1개(마땅찮으면 null), alt_why 2문장 이내.
   - 패키지 없으면 pick_ref=null + data_gaps에 "가격 설정 탭에 패키지를 등록하면 콕 집어드려요".

[data_gaps — 성장 프레임] 기본정보로 위 전부를 반드시 생성한다("정보 부족" 반환 금지). data_gaps는 결핍이
   아니라 "○○를 관찰해오면 △△까지" 형태 긍정 코칭. 충실하면 빈 배열.

[분량 — 외우기 쉽게] 각 대사는 짧고 입에 붙게. line류 1~2문장, why/bridge/so_what 1문장.
[필드명 인용 금지] 값 텍스트에 스키마 키(point_it_out·so_what·objection_defense 등)를 쓰지 마라.
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명 노출 금지. 아래 JSON만(설명·마크다운·코드펜스 금지).
{
  "member_read": "이 회원 한 줄 — 누구고/뭘 원하고/뭐가 걸리나 (3분전 각인 앵커)",
  "opening": { "line": "...", "why": "..." },
  "session_plan": [ { "exercise": "...", "point": "..." } ],
  "target_exercise": { "moves": [ { "exercise": "...", "target_reaction": "...", "point_it_out": "..." }, { "exercise": "...", "target_reaction": "...", "point_it_out": "..." } ], "so_what": "..." },
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  "closing_line": "가정 종결 한마디('등록' 단어 없이)",
  "objection_defense": [ { "reason": "price|hesitation|doubt|time|compare", "trigger": "...", "defense": "...", "line": "..." } ],
  "recommended_program": { "pick_ref": 0, "why_fit": "...", "frequency": "...", "duration": "...", "session_logic": "...", "alt_ref": null, "alt_why": "" },
  "data_gaps": ["..."]
}
※ objection_defense는 위 5개 reason을 각각 1개씩(총 5). pick_ref/alt_ref는 정수 또는 null.`;
}

// ③ phase="second" user 프롬프트
// D-3: cases(내 과거 클로징 케이스)가 있을 때만 case 입력블록·case_feedback 스키마를 additive로 삽입.
//      cases 없거나 빈 배열이면 지금과 바이트 동일한 프롬프트(회귀 안전 제1원칙).
function secondPrompt(member, report, cases = [], caseTier = "tentative") {
  const m = member || {};
  const r = report || {};
  const g2 = (v) => (v == null || v === "" ? "없음" : v);
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
  return `[상황·대전제] 2차 OT 입장 3분 전. 유일한 목적 = 이 회원의 등록(클로징) 확률 극대화. 1차와 달리
아래 '1차 관찰'이라는 실제 근거가 있다 — 이번엔 '증명'으로 클로징을 확실히 닫는다. 트레이너가 30초에
훑어 외우고 폰을 넣는 컨닝페이퍼니, 바로 말할 완성 대사로.

[이 국면 특칙 — 대본 수위] 세일즈·운동 모두 '그대로 말할 실제 대사'까지. 단 숫자 처방(세트·횟수·각도·
중량·템포)과 의료 단정(치료·완치·진단)은 절대 금지.

[회원 기본정보] name=${g2(m.name)}, age=${g2(m.age)}, job=${g2(m.job)}, mbti=${g2(m.mbti)}, pain=${g2(m.pain)}, goal=${g2(m.goal)}

[1차 관찰 기록 — 유일 근거(가설 아님, 트레이너가 실제 관찰)]
${JSON.stringify({
    movements: r.movements ?? [],
    reaction: r.reaction ?? {},
    goal: r.goal ?? {},
    memberQuote: r.memberQuote ?? "",
    trainer_note: r.trainer_note ?? "",
    sales_intensity: r.sales_intensity ?? "standard",
  }, null, 2)}
${caseInputBlock}
이 1차 관찰을 유일 근거로 2차를 설계하라. 없는 관찰·수치·에피소드 창작 금지.
[세일즈 강도] sales_intensity는 근거의 '선명도'다(압박·설득의 세기 아님). strong=사실 기반 손실·긴급성을
더 또렷이 / soft=오늘 밀지 말고 다음 접점의 씨앗 톤(closing_line을 부드러운 가정으로) / standard=담백하게.

[컨닝페이퍼 — 2차는 '증명 → 클로징']
① recall(지난 시간 소환): 1차의 체감·회원 한마디(memberQuote)를 되살려 문을 여는 완성 대사. "지난번
   ○○ 느끼셨던 거 기억나세요?" 결. - line: 그대로 말할 대사 1~2문장. - why: 이걸 여는 이유 1문장.

② session_plan(오늘 수업 운동 구성 — '무엇을 시킬지' 구체적으로): 오늘 2차 수업에서 이 회원에게 실제로
   시킬 운동을 순서대로 3~5개 구성하라. 1차 관찰(movements/reaction)·goal·pain에서 도출하고, 아래 '증명
   포인트'가 잘 터지도록 빌드업되게 짜라(가벼운 활성·준비 → 핵심 → 증명으로 자연히 이어짐). 이게 트레이너가
   '오늘 뭘 시킬지'를 바로 아는 실전 구성이다.
   ★각 운동은 '이름 있는 구체 동작 + 한 줄 큐/세팅'으로. 고정 구성 반복 금지, 회원 goal·pain으로 개인화.
   숫자 처방(세트·횟수·각도·중량·템포) 금지 — 무엇을·어떤 방향으로·왜인지까지만.
   각 항목: exercise(구체 동작 + 한 줄 세팅) / point(왜 시키나 or 핵심 큐 1문장).

③ proof(증명 포인트 2개): 위 수업 구성 중/직후, 회원이 '어? 되네'를 부인 못 하게 터뜨릴 결정적 순간 2개.
   ★동작은 이 회원의 goal·pain·1차 관찰(movements/reaction)에서 도출하라 — 고정 동작 습관 반복 금지,
   직업 비어도 goal·pain으로 개인화, 숫자 처방 금지. 각 동작 before→after 체감 실험으로(먼저 시켜→큐 하나
   잡아줌→확 달라짐, 그 큐가 혼자선 못 잡는 지점).
   moves[] 각: exercise(구체 동작+한 줄 세팅) / target_reaction(before→after 분명한 차이) /
   point_it_out(그 순간 그대로 말할 대사 — "아까랑 다르죠?" + '혼자선 이 세팅 못 잡는다' 심기).
   so_what: 두 증명을 묶어 'PT를 받아야 한다'는 회원 스스로의 결론으로 잇는 한 줄.
   if_weak: 증거 반응이 약하게 올 때 살릴 큐·조정 한 줄(숫자 없이·방향만).

④ sales_metaphor: 회원 직업·일상·목표에서 끌어온 비유 하나(운동·기계 클리셰 금지). metaphor + bridge(등록 필요성으로).

⑤ closing_line: '마지막 OT'급 강한 가정 종결 한마디. '등록하세요'(판매 동사) 금지 → "다음 주부터 이렇게
   가시죠" 결. 긴급성은 사실 기반 손실만("지금 멈추면 오늘 이 감각 흩어져요"). 1차보다 확신 있게.

⑥ objection_defense(거절 선제 방어 5종): price·hesitation·doubt·time·compare 각 1개. 1차 관찰·(있으면)
   회원 quit_reason을 근거로 더 날카롭게. 각: trigger(나올 신호) / defense(공감+세일즈 무브) /
   line(그대로 말할 대사). ⚠️compare는 경쟁사 비방 금지→'오늘 이미 당신 몸에서 확인' 데이터 선점 우위.
   ⚠️허위 긴급성·공포·죄책감 금지.

[member_read] 1차에서 확인된 것 + 지금 클로징 국면을 한 줄로(앵커).
[data_gaps] 관찰이 얇아도 위 전부 반드시 생성("정보 부족" 반환 금지). 긍정 코칭. 충실하면 빈 배열.
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명(memberQuote·point_it_out 등) 값 텍스트 노출 금지.
아래 JSON만 출력(설명·마크다운·코드펜스 금지).
{
  "member_read": "1차 확인된 것 + 지금 클로징 국면 한 줄",
  "recall": { "line": "...", "why": "..." },
  "session_plan": [ { "exercise": "...", "point": "..." } ],
  "proof": { "moves": [ { "exercise": "...", "target_reaction": "...", "point_it_out": "..." }, { "exercise": "...", "target_reaction": "...", "point_it_out": "..." } ], "so_what": "...", "if_weak": "..." },
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  "closing_line": "마지막 OT급 강한 가정 종결 한마디",
  "objection_defense": [ { "reason": "price|hesitation|doubt|time|compare", "trigger": "...", "defense": "...", "line": "..." } ],
  "data_gaps": ["..."]${caseSchemaLine}
}
※ objection_defense는 5개 각 1개. proof.moves는 2개.`;
}

// ④ phase="reregister" user 프롬프트 — 재등록 브리핑(OT 클로징의 PT 대칭).
// ⚠️ origin 독립: ot_log에 의존하지 않는다(인계·외부 PT는 관찰이 없음). PT 관리 데이터만 근거.
function reregisterPrompt(member, ctx) {
  const m = member || {};
  const c = ctx || {};
  const g3 = (v) => (v == null || v === "" ? "없음" : v);
  const recent = Array.isArray(c.recent_logs) ? c.recent_logs.filter(Boolean) : [];
  return `[상황·대전제] PT 재등록 대화 준비(재등록은 보통 '오늘 PT 수업 중'에 이뤄진다). 유일한 목적 =
이 회원의 재등록 확률 극대화. 근거는 관찰(1차)이 아니라 '그동안의 PT 관리 데이터(운동 빈도·수업 일지)'다.
재등록은 '새로 파는 것'이 아니라 '그동안 쌓은 만족·변화를 이어가는 것'. 트레이너가 30초에 훑어 외우고 오늘
수업을 재등록으로 자연히 잇는 컨닝페이퍼 — 바로 말할 완성 대사로.

[이 국면 특칙 — 대본 수위] 세일즈·운동 모두 '그대로 말할 실제 대사'까지. 숫자 처방(세트·횟수·각도·중량·
템포)·의료 단정 금지. 없는 성과·에피소드 창작 금지(관리 데이터에 있는 것만).

[회원 기본정보] name=${g3(m.name)}, age=${g3(m.age)}, job=${g3(m.job)}, mbti=${g3(m.mbti)}, pain=${g3(m.pain)}, goal=${g3(m.goal)}
[현재 PT 방향/목표] ${g3(m.pt_direction)}
[PT 관리 데이터 — 유일 근거]
 계약 회차=${g3(c.contract_count)}, 잔여 유료=${g3(c.remaining?.paid)}, 서비스=${g3(c.remaining?.service)},
 완료 수업수=${g3(c.sessions_done)}, 운동 빈도(주당 추정)=${g3(c.weekly_frequency)}
[최근 수업 일지]
${recent.length ? recent.map((s, i) => `${i + 1}. ${s}`).join("\n") : "없음"}

[컨닝페이퍼 — 재등록은 '그동안의 근거 → 오늘 수업으로 잇기 → 클로징']
① why_now(왜 지금 재등록 — 그동안의 근거): 운동 빈도·수업 일지에서 확인되는 것으로.
   - proven: 그동안 PT로 확인·개선된 것. 빈도가 꾸준하면 근거로("주 N회씩 ○개월 하시면서 ○○ 좋아지셨어요"). 없으면 지어내지 말 것.
   - risk_if_stop: 지금 멈추면 잃는 것(사실 기반 손실 — "쌓은 감각·리듬이 흩어진다"). 없는 위기 창작 금지.
   - next_roadmap: 재등록해야 갈 수 있는 다음 지점(현재 PT 방향에서 출발).

② session_flow(오늘 수업 흐름/방향 — 재등록으로 잇기): 오늘 PT 수업을 재등록으로 자연히 잇는 진행법.
   압박이 아니라 회원이 스스로 '더 해야겠다'를 느끼게.
   - gap_awareness: 수업 중 '아직 남은/부족한 부분'을 자연스럽게 인지시키는 구체 포인트 + 그 순간 말할 대사
     ("여기 아직 좌우 차이 나시죠? 이게 다음 단계예요"). 회원 상태 근거로, 없는 결함 창작 금지.
   - goal_raise: 수업 중간중간 목표를 한 단계 올려 동기를 계속 부여하는 포인트 + 대사
     ("이제 이건 되시니까, 다음은 ○○ 가봅시다").
   - timing: 오늘 수업 중 재등록 얘기를 꺼내기 가장 좋은 타이밍 한 줄.

③ sales_metaphor: 회원 직업·일상·목표에서 끌어온 비유 하나(운동·기계 클리셰 금지). metaphor + bridge(재등록 필요성으로).

④ closing_line: 재등록을 '지금 결정'하게 만드는 클로징 한마디. ★단순히 "다음에도 이어가시죠"류(수업만
   계속하자는 뜻)가 아니라, why_now의 근거를 짚고 '그러니 지금 재등록하는 게 맞다'로 착지해야 한다. 회원이
   "아, 지금 재등록해야겠다"를 납득하게. '재등록하세요'(명령·판매 동사)는 피하되 대상은 분명히 재등록/연장
   결제여야 한다(애매한 '이어가자' 금지). 가정 종결 톤 예: "그동안 ○○ 좋아지셨고 다음이 △△니까, 여기서
   멈추지 말고 딱 이어서(재등록) 가시죠 — 지금이 흐름 안 끊고 갈 타이밍이에요." 긴급성은 사실 기반 손실만.

⑤ sweetener(재등록 혜택 — '덤'으로만): 위 이유를 납득시킨 뒤 마지막에 얹을 가격/혜택 한 줄. PT 재등록은
   보통 가격 혜택이 있으니 활용하되, ★이게 재등록의 '이유'를 대체하면 안 된다(이유가 메인, 혜택은 덤).
   ⚠️구체 할인율·금액은 만들어내지 마라(트레이너가 현장에서 채움) — "회당 단가도 좀 더 챙겨드릴 수 있어요"
   수준의 프레이밍까지만. 혜택 얹는 게 부자연스러우면 빈 문자열.

⑥ objection_defense(재등록 거절 선제 방어 5종): reason 키 고정 — money(금전) · sessions_left(수업 남아 나중에) ·
   low_effect(효과 체감 부족) · time(시간) · schedule(스케줄). 각: trigger(나올 신호) / defense(공감+세일즈 무브,
   반박 아님) / line(그대로 말할 대사). ⚠️low_effect는 방어가 아니라 '왜 아직인지 + 앞으로 어떻게'의 정직한 방향.
   ⚠️허위 긴급성·공포·죄책감 금지.

[member_read] 이 회원 그동안 어땠고 지금 재등록 국면을 한 줄로(앵커).
[data_gaps] 관리 기록이 얇아도 위 전부 반드시 생성("정보 부족" 반환 금지). 긍정 코칭. 충실하면 빈 배열.
[출력 언어] 자연스러운 한국어. 영문 코드값·필드명 값 텍스트 노출 금지. 단 objection_defense.reason은 위 영문
키 그대로 둔다(화면 매칭용). 아래 JSON만 출력(설명·마크다운·코드펜스 금지).
{
  "member_read": "그동안 + 지금 재등록 국면 한 줄",
  "why_now": { "proven": "...", "risk_if_stop": "...", "next_roadmap": "..." },
  "session_flow": { "gap_awareness": "...", "goal_raise": "...", "timing": "..." },
  "sales_metaphor": { "metaphor": "...", "bridge": "..." },
  "closing_line": "재등록 가정 종결 한마디",
  "sweetener": "재등록 혜택 한 줄(덤 · 구체 금액 없이) 또는 빈 문자열",
  "objection_defense": [ { "reason": "money|sessions_left|low_effect|time|schedule", "trigger": "...", "defense": "...", "line": "..." } ],
  "data_gaps": ["..."]
}
※ objection_defense 5개 각 1개.`;
}

// ⑤ phase="acute" user 프롬프트 — 회원 급변 대처(수업 전 준비). ⑤ 치트키/급한불.
// ⚠️ 의료 경계 최우선: 진단·치료·처방 아님. 부상·급성 통증은 병원·의료진 먼저. 숫자 처방 금지·방향만.
// ⚠️ DB 무관: 저장/캐시 없음(세션 전용). ot_log 비의존.
function acutePrompt(member, ctx) {
  const m = member || {};
  const c = ctx || {};
  const recent = Array.isArray(c.recent_logs) ? c.recent_logs.filter(Boolean) : [];
  return `[상황] PT 회원에게 급변(부상·통증 급발생·컨디션 급변 등)이 생겨, 오늘 수업을 어떻게 조정할지 '수업 전'에 준비하는 자리다. 아래는 트레이너가 방금 입력한 '급변 상황'이다.
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, pain=${g(m.pain)}, goal=${g(m.goal)}
[현재 PT 방향/목표] ${g(m.pt_direction)}
[급변 상황(트레이너 입력)] ${g(c.situation)}
[최근 수업 기록]
${recent.length ? recent.map((s, i) => `${i + 1}. ${s}`).join("\n") : "없음"}

이 '급변 상황'을 근거로, 트레이너가 오늘 수업을 안전하게 조정하도록 '방향'을 제시하라. 없는 증상·원인을 지어내지 마라.

[★의료 경계 — 이 출력의 최우선 안전선]
- 이건 진단·치료·처방이 아니다. 트레이너는 의료인이 아니다.
- 부상·급성 통증·의학적 징후(디스크·삠·붓기·저림·급성 통증 등)로 보이면, 최우선 출력은 '병원·의료진 먼저 확인'이다. safety에 그 판단 신호와 넘지 말 선을 담아라.
- 네가 줄 수 있는 건 (a) 오늘 '피할' 움직임·부하 방향과 (b) 의학적 확인 이후를 전제로 한 '복귀 결'까지다. '지금 이걸 대신 시켜라'는 대체 처방이 아니다.
- 상황이 단순 컨디션 저하 등 비의학적이면 safety는 짧게(무리 없는 선 안내).

[출력 규칙 — 스파링 파트너]
- 숫자 처방 절대 금지(횟수·중량·각도·세트·템포·시간 X). 움직임 '방향'과 '원리'까지만.
- 방법도 간략히 — 트레이너가 스스로 응용·공부할 여지를 남겨라(정답 대본·레시피 금지 = 하향평준화 방지).
- 이건 '몸 대처'지 세일즈가 아니다. "그러니 등록/재등록 하라"는 세일즈 몰이 절대 금지.
- 근거가 얇으면 지어내지 말고 data_gaps에 '무엇을 더 확인하면 좋은지' 남겨라.

[출력 언어·형식] 자연스러운 한국어. 영문 코드값·필드명을 값 텍스트에 노출 금지. 아래 JSON 스키마만 출력(설명·마크다운·코드펜스 금지).
{
  "data_gaps": ["..."],
  "safety": "의료 경계 안내 — 병원·의료진 우선이 필요한 신호 + 트레이너가 넘지 말 선(진단·치료 아님). 비의학적이면 짧게.",
  "avoid": [ { "movement": "오늘 피할 움직임·부하 방향", "why": "왜 위험/악화되는지 원리 한 줄" } ],
  "alternatives": [ { "direction": "의학적 확인 이후를 전제로 접근 가능한 결(방향까지만, 없으면 빈 배열)", "why": "그 방향의 원리 한 줄" } ],
  "principle": "이 상황을 관통하는 원리 한 줄 (트레이너가 같은 원리로 자기 판단을 응용하도록)",
  "note": "수업 전 한 줄 준비 프레이밍 (압박·세일즈 아님)"
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
  ["target_exercise", "타겟 운동"],
  ["target_reaction", "노릴 반응"],
  ["point_it_out", "짚어줄 말"],
  ["so_what", "등록 논리"],
  ["sales_metaphor", "세일즈 비유"],
  ["objection_defense", "거절 방어"],
  ["closing_line", "클로징 한마디"],
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

export async function POST(request) {
  const auth = await requireTrainer(request);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI 키가 설정되지 않았습니다. 데모 모드로 동작합니다." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 });
  }

  const { phase, member, report, ptContext, acuteContext, packages, closingCases, caseTier } = body || {};
  if (phase !== "first" && phase !== "second" && phase !== "reregister" && phase !== "acute") {
    return Response.json({ error: "phase는 'first'·'second'·'reregister'·'acute' 중 하나여야 합니다." }, { status: 400 });
  }

  const model = MODEL_SECOND; // 전 phase Sonnet(1차도 승급).
  const basePrompt =
    phase === "first" ? firstPrompt(member, packages)
    : phase === "second" ? secondPrompt(member, report, closingCases, caseTier)
    : phase === "reregister" ? reregisterPrompt(member, ptContext)
    : acutePrompt(member, acuteContext);
  // 장비 등록됐으면 '우선 활용(소프트)'로 앞에 붙임. 0개(미등록)면 안 붙여 종전대로. acute 제외.
  const centerMachines = phase === "acute" ? [] : await fetchCenterMachines(request);
  const prompt =
    (phase === "acute" || centerMachines.length === 0)
      ? basePrompt
      : `${equipmentBlock(centerMachines)}\n[기구 활용] 운동 구성은 위 [보유 장비]를 우선 활용하되, 목표에 더 맞는 장비가 목록에 없으면 그것도 함께 알려줘라(목록은 아직 추가 중일 수 있음). 규격의 중량 범위는 참고만 — 숫자 처방(세트·횟수·중량)은 여전히 금지, 방향까지만.\n\n${basePrompt}`;
  // ① 확정 스키마 출력 ~5.5k 토큰 → 8192 필수(4096이면 JSON 잘려 파싱 불가). ③(Sonnet)은 5120,
  // 단 D-3 케이스 동봉 시 case_feedback ~300~500토큰 더 → 6144(잘림 방지).
  const maxTokens = phase === "first" ? 8192 : (phase === "second" && closingCases?.length ? 6144 : 5120);

  try {
    const anthropic = new Anthropic({ apiKey });
    const req = {
      model,
      max_tokens: maxTokens,
      system: PREAMBLE,
      messages: [{ role: "user", content: prompt }],
    };
    // sonnet-5는 기본이 adaptive thinking이라 JSON 생성엔 불필요 → 전 phase 끔(1차도 Sonnet).
    req.thinking = { type: "disabled" };

    const msg = await anthropic.messages.create(req);
    const textOut = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    // first는 필수 키를 넘겨 스키마 완전성까지 파서가 보장(부분객체·다중블록 방어).
    // second는 별도 스키마라 키 미지정(1순위 단일 파싱 — 기존 동작 유지, 회귀 없음).
    const REQUIRED_FIRST = ["member_read", "opening", "session_plan", "target_exercise", "sales_metaphor", "closing_line", "objection_defense"];
    const REQUIRED_SECOND = ["member_read", "recall", "session_plan", "proof", "sales_metaphor", "closing_line", "objection_defense"];
    const REQUIRED_REREG = ["member_read", "why_now", "session_flow", "sales_metaphor", "closing_line", "objection_defense"];
    const reqKeys = phase === "first" ? REQUIRED_FIRST : phase === "second" ? REQUIRED_SECOND : phase === "reregister" ? REQUIRED_REREG : [];
    const brief = sanitizeFieldNames(parseBrief(textOut, reqKeys));
    return Response.json(brief);
  } catch (e) {
    return Response.json(
      { error: "AI 생성에 실패했습니다: " + (e?.message || "unknown") },
      { status: 502 }
    );
  }
}

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

② target_exercise(타겟 운동 & 리액션 — 세일즈의 '증거' 만들기): 이 블록의 목적은 운동 처방이 아니라,
   회원이 '어? 되네/편해지네'를 그 자리에서 부인할 수 없이 체감하게 해서 'PT가 필요하구나'를 스스로
   느끼게 하는 것이다. ★증거 동작을 2개 제시하라(moves 배열). 각 동작에 두 가지가 필수 —
   (a)구체적으로 콕 집을 것 (b)차이가 확 느껴질 것.
   - ★exercise는 '방향'이 아니라 '이름 있는 구체 동작'으로 지목하라. "~해주는 방향의 동작을 시켜본다"
     처럼 뭉뚱그리면 실패다. 회원의 목적·불편에 맞는 이름 있는 동작을 콕 집어라(예: 밴드 파쓰루,
     월 슬라이드, 흉추 신전, 견갑 세팅, 데드버그, 힙힌지 등 — 회원에 맞게 골라라). 단 숫자 처방
     (세트·횟수·각도·템포·중량)은 트레이너 몫이니 넣지 마라(동작은 구체적으로, 숫자는 비워라).
   - ★차이가 극적인 동작을 골라라 — 각 동작을 가능하면 'before→after' 체감 실험으로: 먼저 시켜
     지금 상태를 느끼게 → 큐·세팅 하나 잡아줌 → 다시 시키면 확 달라짐. 그 '큐'가 혼자선 못 잡는 지점이다.
   - ★2개는 서로 겹치지 않게: 1번은 회원의 '주 불편/목적'을 직격하는 동작, 2번은 다른 각도(연관 부위·
     기능)에서 한 번 더 체감시켜 '우연이 아니다'를 쐐기 박는 동작으로.
   moves[] 각 항목:
   - exercise: 콕 집은 구체 동작 이름 + 어떻게 시키는지 한 줄(숫자 없이).
   - target_reaction: 회원이 느낄 '분명한' 차이를 before→after 대비로(예: "처음엔 뻐근·제한 → 세팅 후 확 트임").
   - point_it_out: 그 차이가 난 순간 그대로 말할 실제 대사 — before→after를 회원이 인정하게 묻고
     ("아까랑 다르죠?"), '이건 혼자선 이 세팅을 못 잡는다'를 자연스럽게 심어라. 1~2문장.
   그리고 so_what(moves 밖 · 2개 공통): 두 체감을 묶어 'PT를 받는 게 낫겠다'는 회원 스스로의 결론으로
   잇는 한 줄(압박 아님·사실 기반).

③ sales_metaphor(세일즈 비유 — 회원 세계 언어): 회원의 직업·일상·목표에서 끌어온 비유 하나로 '지금
   안 하면/함께 하면'을 그림처럼. 운동·기계 클리셰("브레이크-액셀") 금지.
   - metaphor: 그대로 말할 비유 대사 1~2문장.  - bridge: 비유→등록 필요성으로 잇는 한 줄.

④ closing_line(클로징 한마디): 오늘 체감을 근거로 한 '가정 종결' 한 문장. '등록하세요'(판매 동사) 금지 →
   "다음 주부터 이렇게 가시죠" 결. 긴급성은 사실 기반 손실만.

⑤ objection_defense(거절 선제 방어 5종): 아래 5개 각각 미리 무장. 반박이 아니라 '공감으로 빗장 풀고
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
  const validCases = Array.isArray(cases) ? cases.filter(Boolean) : [];
  const hasCases = validCases.length > 0;
  const tierLabel = caseTier === "confident" ? "뚜렷" : "잠정(케이스 아직 적음)";
  const caseInputBlock = hasCases
    ? `
[내 과거 클로징 케이스 — 이 트레이너 본인 것만 · 경향 신뢰도=${tierLabel}]
아래는 네가 과거에 클로징한 회원들의 '익명 프로파일 + 3박자(접근·반응·결과)'다. 이번 회원과
비슷한 프로파일을 골라 case_feedback을 채워라. 이건 세일즈 대본 하달이 아니라 '거울'이다 —
네 과거를 비춰 이번 판단을 돕는 스파링이다.
 - 진단 먼저: 표면 거절(가격·망설임)이 아니라 '진짜 장애물'을 짚어라(예: '남편 상의'=가격이
   아니라 결정권이 회원한테 없던 것). 트레이너에게 '다음에도 쓸 안목'을 남겨라.
 - 성공 케이스=리딩 재료: 비슷한 프로파일에 통한 접근을 근거로, 회원이 그 욕구를 '자기 말로'
   꺼내게 어떻게 리딩할지 방향을 줘라. ⚠️ 회원 입에 트레이너 논리를 이식(외운 대사)하는 건
   역효과다 — '배우고 싶다/혼자보다 낫다'는 느낌에 스스로 도달하게 이끄는 리딩이어야 한다.
 - 막힌 케이스=다른 벡터: 같은 프레임을 반복하지 마라. 과거 이 프로파일에서 막힌 방향이 있으면
   '이번엔 그거 말고 X 방향으로' + 왜인지 명시하라(같은 실패 반복 차단).
 - 강도 가드: 압박 ≠ 정당한 강조. 강도는 근거·책임의 세기지 소진·조작이 아니다. 허위 긴급성·
   공포·죄책감·2~3시간 붙잡기 금지. 단 회원 상태가 진짜 필요하면(부상 위험 등) 책임에서 나온
   '제대로 배우셔야 한다' 강조는 정당하다(의료 단정은 여전히 금지).
 - 경향이 '잠정'이면 단정하지 말고 '아직 케이스가 적어 잠정 경향' 톤으로 하되, 반드시 채워라.
[케이스 목록] (result=success/fail/hold · profile=익명)
${validCases.map((c, i) => `${i + 1}. [${c.result}] 프로파일=${JSON.stringify(c.profile)} · 접근=${c.detail?.approach ?? c.approach ?? "-"} · 반응=${c.detail?.reaction ?? "-"} · 결과=${c.detail?.outcome ?? c.reason ?? "-"}`).join("\n")}
`
    : "";
  const caseFieldsBlock = hasCases
    ? `
[case_feedback — 내 과거 케이스 거울 (cases 있을 때만)]
 - diagnosis: 과거 케이스에 비춘 이 회원의 '진짜 장애물' 진단(표면 아닌 근본). 근거 얇으면
   1차 관찰로 가설. 1~2문장. [거울 톤 — 단정보다 '~로 보인다']
 - proven_lead: 비슷한 프로파일에 통한 접근을 근거로, 이번에 회원이 욕구를 '자기 말로' 꺼내게
   어떻게 리딩할지 방향. 대사 이식·낭독 금지. 1~2문장.
 - avoid_repeat: 과거 이 프로파일에서 막힌 벡터가 있으면 '이번엔 그거 반복 말고 X 방향' + 왜.
   해당 없으면 null. 1문장.
 - example: proven_lead의 한 문장 샘플('예시'·발판 — 낭독 대본 아님). 1문장.
 - your_read: 트레이너에게 사고를 되돌리는 넛지 1문장("네 판단은? 이 진단이 맞다고 보나?" 결).
`
    : "";
  const caseSchemaLine = hasCases
    ? `,
  "case_feedback": { "diagnosis": "...", "proven_lead": "...", "avoid_repeat": "... 또는 null", "example": "...", "your_read": "..." }`
    : "";
  return `[상황] 2차 OT. 아래 '1차 관찰 기록'은 트레이너가 실제 입력한 관찰이다(가설 아님).
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}
[1차 관찰 기록]
${JSON.stringify(
    {
      movements: r.movements ?? [],
      reaction: r.reaction ?? {},
      goal: r.goal ?? {},
      memberQuote: r.memberQuote ?? "",
      trainer_note: r.trainer_note ?? "",
      sales_intensity: r.sales_intensity ?? "standard",
    },
    null,
    2
  )}
${caseInputBlock}
이 '1차 관찰'을 유일한 근거로 2차를 설계하라.
[재료 확장] 트레이너 종합 소견(자유서술)이 있으면 정형 관찰과 함께 근거로 삼아라. 정형 항목에
안 담긴 트레이너의 판단·가설이니 briefing·closing 논리에 반영하되, 없는 사실을 지어내진 마라.
[세일즈 강도] sales_intensity는 트레이너가 이 회원에 지시한 '근거·긴급성을 얼마나 또렷이 짚을지'다.
압박·설득의 세기가 아니다(PREAMBLE 윤리 상속).
 · standard: 기본. 사실 기반으로 담백하게.
 · strong: 사실 기반 손실·긴급성을 '더 또렷하고 구체적으로' 짚어라(예: 자세 무너짐→통증 악화 경로를
   회원 일상 언어로 선명히). ⚠️ 단 '없는 위기 창작·공포몰이·허위 긴급성'은 여전히 절대 금지 —
   또렷함은 근거의 선명도지 위협의 크기가 아니다. 강해지는 건 '증거'지 '압박'이 아니다.
 · soft: 신뢰가 덜 쌓인 회원. 오늘 클로징을 미루고 라포·다음 접점으로 방향을 잡아라(1차 watch_for
   미루기 로직과 일관). closing 4단계는 여전히 생성하되 land를 '가정 종결' 대신 '다음 약속의 씨앗'
   톤으로 부드럽게.
1) briefing(등록 당위성 논리): proven_in_1st(1차 확인) → risk_if_alone(혼자 하면 위험한 지점, 사실 기반)
   → to_prove_in_2nd(2차에 몸으로 증명할 것) → closing_logic("혼자선 못 잡는다"의 논리, 낭독 대본 아님).
2) arc(2차 대화 흐름): movements[].plan2nd를 arc의 중심축으로. memberAware=true 항목은 '회원이 스스로 인지한 것'이라
   소환 비트에 강력하니 우선 활용. memberQuote가 있으면 '1차 소환' 비트에서 회원 본인 워딩을 그대로 되살려라.
3) closing: 2차 실시간 자극 결과 분기(yes/partial/no) 3버전 프리생성. 각 분기를 아래 4단계
   골격으로(진입→그림→착지→침묵). 각 분기에 approach_tag 제안.
   "마지막 OT"급으로 확실하되, 압박이 아니라 '깊이 이해받았다'는 공감으로.
4) objections(거절 대처): 황현진 4유형(망설임·거부·의심·재확인)으로. 반박이 아니라 '공감으로 빗장 풀기 + 세일즈 무브'.
   각 유형: customer_says(그 유형이 흔히 하는 말) / reframe_direction(공감으로 빗장 푸는 방향, 반박 아님) /
   sales_move(공감 뒤 바로 잇는 세일즈 무브 — 무엇을 보여주고 어떤 제안으로 다시 클로징으로 끌어오나, 물러서지 말 것) /
   example(그 자리에서 회원에게 바로 말할 '실제 대사' 한 줄, 발판·흐림 아님 · 완성 문장 "○○님, …").
5) stimulus_response(자극반응별 운동 대처 · 수업 전 준비물): 오늘 자극 결과 3분기(yes/partial/no)별로
   트레이너가 '수업 전에 미리 숙지'할 운동 대처를 설계하라. 이건 세일즈(closing)가 아니라 '몸을 어떻게
   조정하나'다. 각 분기:
   · cause: 그 반응이 나온 원인(1차 관찰 근거로. 없는 원인 창작 금지).
   · adjustment: 수업 중 적용할 조정 '방향'. ⚠️ 숫자 처방 절대 금지(각도·템포·세트·횟수·중량 X) —
     움직임 방향까지만("발끝 안쪽·상체 전방 힙힌지" O / "15도·3세트" X).
   · direction: 그 조정으로 노리는 목표(예: 앞허벅지 차단→둔근 단독 점화).
   yes 분기는 '대처'가 아니라 '잘 온 세팅을 어떻게 각인·유지하나'로. partial/no는 '무엇을 바꿔 자극을
   끌어올리나'로. ⚠️ no라고 '그러니 등록하라'는 세일즈로 새지 말 것 — 여긴 운동 대처만, 세일즈는 closing 소관.

[클로징 4단계 골격 — 각 분기 필수]
  ★enter·paint·land의 값은 트레이너가 회원에게 그대로 말할 '실제 대사'로 써라(설명·지시문 아님,
   "○○님, …" 1인칭). 확신 있게, 흐릿한 예시로 물러서지 말 것. hold만 트레이너용 지시(멈춤)다.
  enter(진입):  "등록" 단어로 시작 금지. 오늘 회원 몸에서 일어난 사실을 짚고 "그래서 회원에게
                무슨 의미인지(So what?)"로 연다. memberQuote/memberAware를 여기서 소환하면 강력.
  paint(그림):  핵심 진단·필요성을 추상 설명 금지. 반드시 '일상 비유 하나'로 회원 머릿속에
                그림을 그린다(예: "브레이크 밟고 액셀 밟는 격"). 이게 이 화법의 시그니처.
  land(착지):   등록 제안을 '왜 필요한가 + 왜 지금인가'로. goal_type에 맞는 기대 키워드로 착지
                (pain→해결·안심 / appearance→자부심 / health→안심 / 기타→이익).
                '등록하세요'(판매 동사) 금지 → 가정 종결("다음 주부터 이렇게 가시죠")로.
                긴급성은 '사실 기반 손실'만("지금 멈추면 이 감각 사라져요"), 없는 위기 조장 금지.
  hold(침묵):   land 후 멈추라는 지시. "여기서 말 멈추고 회원 답을 기다리세요" 문구를 담는다.

[화법 원리 — 황현진式, 모든 문장에 적용]
  - 畵法(그림 그리기): 설명은 추상어 대신 비유·오감으로 생생하게. "설득"이 아니라 "설명".
  - So what?: 사실 나열 금지. 반드시 "그래서 회원에게 무슨 의미인지"까지 연결.
  - 담백하게: 화려한 설득·고상한 단어 금지. 쉬운 말로.
  - 위협 소구(겁주기) 금지 → 사실 기반 손실 프레이밍으로 대체(공포 조장은 재등록을 무너뜨림).
${caseFieldsBlock}
[data_gaps = 성장 프레임 (부족/결핍 아님)]
- 관찰이 1~2개로 얇더라도, 있는 것만으로 클로징 4단계와 arc를 '반드시' 생성한다.
  "데이터 부족으로 못 한다"는 반환 금지. 빈손으로 돌려주지 말 것.
- data_gaps는 '부족/결핍'이 아니라 '더하면 좋아지는 것(성장)'이다. "없어서 못 한다" 뉘앙스 금지.
- 문구는 항상 긍정 코칭: "○○를 더 관찰하시면 클로징에서 △△까지 짚어드릴 수 있어요" 형태.
- 관찰이 이미 충실하면 이 배열을 빈 배열 또는 1개 이하로. 억지로 채우지 말 것.
  (채울수록 새 항목이 무한 생성되면 안 됨 — 충실하면 사라져야 함.)
- memberQuote(회원 한마디)는 얇은 관찰에서도 강력한 재료 — 있으면 도입 소환에 반드시 활용.

[출력 언어 규칙]
- 모든 출력 텍스트는 자연스러운 한국어. 입력으로 받은 영문 코드값(timid, well, pain,
  appearance, memberQuote 등)을 출력에 그대로 노출 금지. 반드시 한글로 풀어 쓴다
  (timid→겁많음, active→적극적, well→자극 잘 느낌, pain→통증개선 등). 필드명은 화면에 쓰지 말 것.
- data_gaps를 포함한 모든 출력에서 memberQuote·memberAware 등 '필드명 자체'를 쓰지 말 것.
  '회원 한마디', '회원이 스스로 인지한 항목'처럼 한글로 풀어 쓴다.

[비유 개인화 규칙]
- paint(비유)는 이 회원의 직업·취미·일상(job, goal.detail)에서 끌어와라
  (골프→스윙·어드레스, 좌식→책상·의자, 요리사→주방 동작 등). 운동/기계 클리셰
  ("브레이크-액셀", "기름칠" 등)에 기대지 말 것. 회원 세계의 언어로 그린다.
  회원 정보에 쓸 소재가 없을 때만 일반 비유 허용.

아래 JSON 스키마만 출력(설명·코드펜스 금지):
{
  "data_gaps": ["..."],
  "briefing": { "proven_in_1st": "...", "risk_if_alone": "...", "to_prove_in_2nd": "...", "closing_logic": "..." },
  "arc": [ { "when": "도입|중반|후반|마무리", "intent": "...", "direction": "...", "example": "...", "tone": "..." } ],
  "closing": {
    "yes":     { "approach_tag": "value|pain|appearance|other", "enter": "진입(등록 단어 금지, So what?)", "paint": "일상 비유 하나", "land": "착지(왜+지금, 가정 종결)", "hold": "여기서 멈추고 회원 답을 기다리세요" },
    "partial": { "approach_tag": "...", "enter": "...", "paint": "...", "land": "...", "hold": "..." },
    "no":      { "approach_tag": "...", "enter": "...", "paint": "...", "land": "...", "hold": "..." }
  },
  "objections": [ { "type": "망설임|거부|의심|재확인", "customer_says": "이 유형이 흔히 하는 말", "reframe_direction": "공감으로 빗장 푸는 방향(반박 아님)", "sales_move": "...", "example": "..." } ],
  "stimulus_response": {
    "yes":     { "cause": "...", "adjustment": "숫자 없이 방향만", "direction": "..." },
    "partial": { "cause": "...", "adjustment": "...", "direction": "..." },
    "no":      { "cause": "...", "adjustment": "...", "direction": "..." }
  }${caseSchemaLine}
}`;
}

// ④ phase="reregister" user 프롬프트 — 재등록 브리핑(OT 클로징의 PT 대칭).
// ⚠️ origin 독립: ot_log에 의존하지 않는다(인계·외부 PT는 관찰이 없음). PT 관리 데이터만 근거.
function reregisterPrompt(member, ctx) {
  const m = member || {};
  const c = ctx || {};
  const recent = Array.isArray(c.recent_logs) ? c.recent_logs.filter(Boolean) : [];
  return `[상황] PT 재등록 대화 준비. 아래는 이 회원의 'PT 관리 데이터'다(1차 관찰이 아님 — 인계·외부 회원은 관찰 자체가 없다).
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}
[현재 PT 방향/목표] ${g(m.pt_direction)}
[관리 이력] 계약 회차=${g(c.contract_count)}, 잔여 유료=${g(c.remaining?.paid)}, 서비스=${g(c.remaining?.service)}
[최근 수업 기록]
${recent.length ? recent.map((s, i) => `${i + 1}. ${s}`).join("\n") : "없음"}

이 'PT 관리 데이터'를 유일한 근거로 재등록 대화를 설계하라. 없는 성과·에피소드를 지어내지 마라.
재등록은 '관리로 쌓은 만족을 이어가는 것'이지 '새로 파는 것'이 아니다 — 압박·공포가 아니라 그동안의 근거와 앞으로의 방향으로.

1) briefing(재등록 당위성 논리):
   · proven_in_pt: 그동안 PT로 확인·개선된 것(관리 이력·최근 기록 근거. 없으면 지어내지 말 것).
   · risk_if_stop: 지금 멈추면 잃는 것(사실 기반 손실 — "쌓은 감각이 흩어진다" 류. 없는 위기 창작 금지).
   · next_roadmap: 앞으로의 방향(현재 PT 방향/목표에서 출발해 재등록해야 갈 수 있는 다음 지점).
   · closing_logic: 재등록 당위성 논리(낭독 대본 아님 — 근거의 연결).
2) arc(재등록 대화 흐름): 도입→중반→후반→마무리. 관리 이력을 소환해 '함께 만든 변화'를 근거로.
3) objections(이유별 대처): 아래 재등록 보류/거절 이유 카테고리별로, 반박이 아니라 '걱정 해소 방향'을 미리 준비하라
   (회원이 어떤 이유를 대든 트레이너가 방향을 갖고 있도록). 각 이유:
   · money(금전 부담) · time(시간 부족) · schedule(스케줄 안 맞음)
   · sessions_left(수업 남아 나중에) · low_effect(효과 체감 부족) · personal(개인 사정)
   각 항목: customer_says(그 이유의 회원이 흔히 하는 말) / reframe_direction(공감으로 걱정 푸는 방향, 반박 아님) /
   sales_move(공감 뒤 바로 잇는 세일즈 무브 — 무엇을 보여주고 어떤 제안으로 다시 재등록으로 끌어오나, 물러서지 말 것) /
   example(그 자리에서 회원에게 바로 말할 '실제 대사' 한 줄, 발판·흐림 아님 · 완성 문장 "○○님, …").
   ⚠️ "지금 안 하시면 손해예요" 류 압박·공포 대본 금지. 사실 기반 + 회원 이익 방향으로만.
   특히 low_effect(효과 체감 부족)는 방어가 아니라 '왜 아직인지 + 앞으로 어떻게'의 정직한 방향으로.
4) closing(재등록 클로징 4단계): 진입→그림→착지→침묵.

[클로징 4단계 골격]
  ★enter·paint·land의 값은 트레이너가 회원에게 그대로 말할 '실제 대사'로 써라(설명·지시문 아님,
   "○○님, …" 1인칭). 확신 있게, 흐릿한 예시로 물러서지 말 것. hold만 트레이너용 지시(멈춤)다.
  enter(진입): "재등록" 단어로 시작 금지. 그동안 회원 몸/생활 변화를 짚고 "그래서 무슨 의미인지(So what?)"로 연다.
  paint(그림): 추상 설명 금지. 회원 세계(직업·일상·목표)의 '일상 비유 하나'로 그린다.
  land(착지): 재등록 제안을 '왜 필요한가 + 왜 지금인가'로. '재등록하세요'(판매 동사) 금지 → 가정 종결("다음 달도 이렇게 이어가시죠"). 긴급성은 '사실 기반 손실'만.
  hold(침묵): "여기서 말 멈추고 회원 답을 기다리세요" 문구를 담는다.

[화법 원리 — 모든 문장에 적용]
  - 그림 그리기: 추상어 대신 비유·오감. "설득"이 아니라 "설명".
  - So what?: 사실 나열 금지, "그래서 회원에게 무슨 의미인지"까지 연결.
  - 담백하게: 화려한 설득어 금지, 쉬운 말로.
  - 위협 소구 금지 → 사실 기반 손실 프레이밍으로 대체(공포는 재등록 관계를 무너뜨린다).

[data_gaps = 성장 프레임]
- 관리 기록이 얇아도 있는 것만으로 briefing·arc·closing을 반드시 생성한다("데이터 부족" 반환 금지).
- data_gaps는 '결핍'이 아니라 '더하면 좋아지는 것'. 긍정 코칭 문구로. 이미 충실하면 빈 배열 또는 1개 이하.

[출력 언어 규칙]
- 모든 출력은 자연스러운 한국어. 입력 영문 코드값을 출력 텍스트에 노출 금지 — 한글로 풀어 쓴다.
  단 objections[].reason 필드값은 위 영문 카테고리 키(money 등) 그대로 둔다(화면 매칭용).
- 필드명 자체를 출력 문장에 쓰지 말 것.

[비유 개인화 규칙]
- paint 비유는 이 회원의 직업·일상·목표에서 끌어와라. 운동/기계 클리셰에 기대지 말 것. 소재 없을 때만 일반 비유.

아래 JSON 스키마만 출력(설명·코드펜스 금지):
{
  "data_gaps": ["..."],
  "briefing": { "proven_in_pt": "...", "risk_if_stop": "...", "next_roadmap": "...", "closing_logic": "..." },
  "arc": [ { "when": "도입|중반|후반|마무리", "intent": "...", "direction": "...", "example": "...", "tone": "..." } ],
  "objections": [ { "reason": "money|time|schedule|sessions_left|low_effect|personal", "customer_says": "...", "reframe_direction": "공감으로 걱정 푸는 방향(반박 아님)", "sales_move": "...", "example": "..." } ],
  "closing": { "enter": "진입(재등록 단어 금지, So what?)", "paint": "일상 비유 하나", "land": "착지(왜+지금, 가정 종결)", "hold": "여기서 멈추고 회원 답을 기다리세요" }
}`;
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
  const prompt =
    phase === "first" ? firstPrompt(member, packages)
    : phase === "second" ? secondPrompt(member, report, closingCases, caseTier)
    : phase === "reregister" ? reregisterPrompt(member, ptContext)
    : acutePrompt(member, acuteContext);
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
    const REQUIRED_FIRST = ["member_read", "opening", "target_exercise", "sales_metaphor", "closing_line", "objection_defense"];
    const brief = sanitizeFieldNames(
      parseBrief(textOut, phase === "first" ? REQUIRED_FIRST : [])
    );
    return Response.json(brief);
  } catch (e) {
    return Response.json(
      { error: "AI 생성에 실패했습니다: " + (e?.message || "unknown") },
      { status: 502 }
    );
  }
}

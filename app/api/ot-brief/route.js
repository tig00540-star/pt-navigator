// app/api/ot-brief/route.js
// -----------------------------------------------------------------------------
// OT 여정 AI 지원 (서버 전용). 순수 생성기 — 캐시는 클라이언트가 담당.
//   phase "first"  → ① 1차 지원 (haiku): 기본정보 → 6단계 arc·movement_cues·closing_compass·soft_closing (S4 확정본)
//   phase "second" → ③ 2차 지원 (sonnet): 1차 관찰 → 등록 당위성 브리핑·arc·closing 3분기·objections
// system = 가드레일 프리앰블(스파링 파트너/환각 금지/윤리/출력규칙, 문자 그대로).
// 키 미설정·API 실패·JSON 파싱 실패 → 명확한 상태코드 (프론트가 데모 폴백 판별).
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60; // ③ Sonnet 생성이 최대 ~1분 → Vercel 함수 타임아웃 상향

const MODEL_FIRST = "claude-haiku-4-5-20251001";
const MODEL_SECOND = "claude-sonnet-5";

// §5 가드레일 프리앰블 — 변경 금지.
const PREAMBLE = `너는 피트니스 트레이너의 '스파링 파트너'다. 정답 대본을 주는 도구가 아니라,
트레이너가 자기 생각과 비교·검증하도록 근거와 방향을 제시하는 파트너다.

[환각 금지]
- 트레이너가 입력한 관찰/정보만 재구성한다. 없는 관찰·수치·에피소드를 지어내지 않는다.
- 데이터가 빈약하면 채우지 말고 data_gaps 배열에 "무엇이 부족한지"를 적어 트레이너가
  채우게 남겨둔다. 빈약한 근거로 단정하지 않는다.

[윤리 가드레일]
- 허용: 회원 '본인 데이터'로 말하기 / 사실 기반 손실 프레이밍("지금 멈추면 원점") /
        "혼자서는 이 세팅을 못 잡는다"(사실인 책임의 말).
- 금지: 허위 긴급성, FOMO 남발, 죄책감 유발, 의료·완치·치료 표현.
- 경계선: '사실 기반 손실'은 OK, '없는 위기를 지어내는 공포 조장'은 금지.
  강한 클로징의 원천은 압박이 아니라 "이 트레이너가 나를 정확히 이해했다"는 공감이다.

[출력 규칙]
- 대본을 통째로 주지 말 것. intent(왜)·direction(무엇을) 중심으로 쓰고,
  example(예시 문장)은 어디까지나 '예시'다. 트레이너가 자기 스타일로 채운다.
- 숫자 처방(각도·템포·세트·중량) 금지. 움직임 '방향'까지만("전방 힙힌지로 둔근 개입").
- 반드시 지정된 JSON 스키마만 출력. 설명·마크다운·코드펜스 금지.`;

const g = (v) => (v == null || v === "" ? "없음" : v);

// ── ① firstPrompt — 톤 검토 4개 반영본 (member 기본정보만) ────────────────────
function firstPrompt(member) {
  const m = member || {};
  const machines = Array.isArray(m.machines) ? m.machines.join(", ") : g(m.machines);
  return `[상황] 1차 OT 전/중. 아직 관찰 데이터가 없다 — 아래는 관찰이 아니라 '사전 정보(회원 기본정보)'다.
모든 판단은 '가설'임을 전제한다("~일 가능성" 톤). 없는 관찰·수치·에피소드를 지어내지 않는다.
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, residence=${g(m.residence)},
               mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}, machines=${machines}

[이 도구의 정체성 — 모든 출력에 관통]
이건 '세일즈 도구'가 아니라 '트레이너 성장 엔진'이다. 아래 출력은 정답 대본이 아니라 '발판'이다.
목적(무엇을 이루려는가)은 명확히 제시하되(밍밍한 방치 금지), 수단은 강요하지 않는다(획일 금지).
톤 원칙(모든 방향·예시에 적용): "목적은 이것, 예를 들면 이렇게, 본인 방식 있으면 그대로 쓰세요."
특히 세일즈·클로징은 압박이 아니라 '이 트레이너가 나를 정확히 이해했다'는 공감에서 나온다(PREAMBLE
상속). 회원을 '설득 대상'이 아니라 '이해할 사람'으로 다뤄라.

기본정보만으로 1차 OT를 처음부터 끝까지 길잡이하라. 6단계 흐름(arc)이 척추다.

[arc — 1차 OT 6단계 흐름] 각 비트: when / intent(왜) / direction(무엇을, 참고 방향) /
example(예시 문장 — 발판, 낭독기 아님) / tone(말투).
 1) 라포: 회원 정보(직업·거주·나이 등)로 말문 열 첫 화제·라포 팁. 힌트로(대본 아님).
 2) 문진·공감: 목적·불편함·'왜'·수술이력을 끌어내는 흐름. 인바디 측정을 이 상담 안에 자연스럽게
    녹인다(흐름 안내만) — 인바디 '수치의 해석·설명'은 생성하지 말 것(트레이너 몫).
 3) 자각(핵심): 목적은 '회원이 스스로 문제를 자각'하는 것(고정). 수단은 트레이너 자유다.
    자각을 유도할 '평가 동작'을 어디까지나 '예시(참고)'로 제시하라(예: 오버헤드 스쿼트 등) —
    "이렇게 시켜 이런 반응이 나오면 회원이 자각"까지. 단, FMS 등 평가도구의 정밀 채점 기준·세부
    점수는 지어내지 말 것(가리키기만). "본인 평가 방식이 있으면 그대로 쓰라"는 여지를 남겨라.
 4) 치트키 운동: 아래 movement_cues와 연결(평가동작=진단, 치트키=해결의 짝).
 5) 수업 피드백: 오늘 몸에서 일어난 것을 되짚는 흐름.
 6) 세일즈: 아래 closing_compass와 연결.

[movement_cues — 치트키 1개] 자각에서 드러난 문제를 즉효로 체감시키는 치트키 '1개만'.
숫자 처방(세트·횟수·각도) 금지, 움직임 '방향'까지만.
 - exercise: 치트키 동작(방향까지).  - why_instant: 회원이 그 자리에서 '되네?'를 느끼는 이유.
 - cueing: 현장 큐잉(예시 — 흐림/발판).  - dialogue: 함께 건넬 대화 결(예시 — 흐림/발판).
 - connects_to_closing: 이 몸의 경험이 어떤 클로징 논리로 이어지나.
 - principle: 이 동작이 통하는 '원리'(트레이너가 같은 원리로 자기 필살기를 응용하도록).
   ※ 운동 영상 링크(URL)는 절대 생성 금지 — 원리 설명으로 대체.

[closing_compass — 세일즈 나침반] 이 방향으로 공감하면 회원이 등록을 '압박'이 아니라 '내 문제
해결'로 느끼게 되는 나침반이다. (등록은 목표가 아니라, 회원이 깊이 이해받았을 때 따라오는
결과다.) 압박 플레이북이 아니다.
 - approach_tag: 회원 목적 축(pain=불편함개선 / appearance=외형 / value=가치 / other).
 - why_higher_odds: '이 방향으로 공감하면 회원이 등록을 압박이 아니라 내 문제 해결로 느끼게
   되는 이유'. 회원의 목적·불편함·'직업'·'나이'를 사실 기반으로 엮어라(좌식→어깨·거북목,
   40대→건강·회복). MBTI는 '있을 때만' 가설 보조("~성향이면 ~할 수 있다"), 단정 금지, 비어
   있으면 언급 금지. ※'등록 확률을 올리는'(회원 대상) 방향이 아니라 회원이 '해결로 느끼게'
   하는(회원 위함) 방향을 써라 — 등록은 이해받았을 때 따라오는 결과다.
 - watch_for: 이 방향이 '안 먹힐' 신호 = 밀어붙이지 말라는 브레이크(안전핀). 신뢰가 아직이면
   오늘 세일즈를 미루고 라포로 돌아가는 게 정답이다.
   ★ 단, 미루기는 '포기'가 아니라 2차로 넘기는 '전략적 선택'임을 반드시 담아라:
     · 오늘은 몸으로 느낀 경험을 남기고 '다음 접점'을 만든다(다음 약속의 씨앗:
       "오늘 느낀 이 감각이 다음에 어떻게 발전하는지 보여드릴게요" 식).
     · 관찰한 것을 '관찰기록'에 남기면 → 2차 지원 AI가 그 재료로 더 강한 클로징을 준비한다.
     · 1차에서 무리하게 미는 것보다 신뢰 쌓고 2차에서 제대로 클로징하는 게 등록률이 높다
       (1차 미루기 = '보류' = 2차 클로징 대상 — 미루기가 1차와 2차를 잇는 다리다).

[soft_closing — 부담 없는 1차 마무리] approach_tag / logic / example(예시·흐림).
 - logic: 강요·긴급성 금지. 미지근하거나 신뢰가 덜 쌓였으면 '오늘은 클로징 없이 다음 약속만'도
   정답임을 담아라(위 watch_for 미루기 연결과 일관되게).

[data_gaps — 성장 프레임] 지금 정보로 위 전부를 '반드시' 생성하라("정보 부족으로 못 한다" 금지).
data_gaps는 결핍이 아니라 '더하면 좋아지는 것'이다("○○를 관찰해오시면 △△까지 짚어드릴 수 있어요"
형태의 긍정 코칭). 기본정보가 충실하면 빈 배열 또는 1개 이하로(억지로 채우지 말 것).

[출력 언어·형식] 모든 텍스트는 자연스러운 한국어. 영문 코드값(pain, appearance 등)·필드명을 출력에
노출 금지. 반드시 아래 JSON 스키마만 출력. 설명·마크다운·코드펜스 금지.
{
  "data_gaps": ["..."],
  "hypothesis": "회원 기본정보 기반 접근 가설 (관찰 아님, '~일 가능성' 톤)",
  "observe_targets": ["자각(평가 동작)에서 1차에 확인해올 것 (관찰 단위)"],
  "arc": [ { "when": "라포|문진·공감|자각|치트키 운동|수업 피드백|세일즈", "intent": "...", "direction": "...", "example": "...", "tone": "..." } ],
  "movement_cues": { "exercise": "...", "why_instant": "...", "cueing": "...", "dialogue": "...", "connects_to_closing": "...", "principle": "..." },
  "closing_compass": { "approach_tag": "pain|appearance|value|other", "why_higher_odds": "...", "watch_for": "..." },
  "soft_closing": { "approach_tag": "pain|appearance|value|other", "logic": "...", "example": "..." }
}`;
}

// ③ phase="second" user 프롬프트
function secondPrompt(member, report) {
  const m = member || {};
  const r = report || {};
  return `[상황] 2차 OT. 아래 '1차 관찰 기록'은 트레이너가 실제 입력한 관찰이다(가설 아님).
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}
[1차 관찰 기록]
${JSON.stringify(
    {
      movements: r.movements ?? [],
      reaction: r.reaction ?? {},
      goal: r.goal ?? {},
      memberQuote: r.memberQuote ?? "",
    },
    null,
    2
  )}

이 '1차 관찰'을 유일한 근거로 2차를 설계하라.
1) briefing(등록 당위성 논리): proven_in_1st(1차 확인) → risk_if_alone(혼자 하면 위험한 지점, 사실 기반)
   → to_prove_in_2nd(2차에 몸으로 증명할 것) → closing_logic("혼자선 못 잡는다"의 논리, 낭독 대본 아님).
2) arc(2차 대화 흐름): movements[].plan2nd를 arc의 중심축으로. memberAware=true 항목은 '회원이 스스로 인지한 것'이라
   소환 비트에 강력하니 우선 활용. memberQuote가 있으면 '1차 소환' 비트에서 회원 본인 워딩을 그대로 되살려라.
3) closing: 2차 실시간 자극 결과 분기(yes/partial/no) 3버전 프리생성. 각 분기를 아래 4단계
   골격으로(진입→그림→착지→침묵). 각 분기에 approach_tag 제안.
   "마지막 OT"급으로 확실하되, 압박이 아니라 '깊이 이해받았다'는 공감으로.
4) objections(거절 대처): 황현진 4유형(망설임·거부·의심·재확인)으로. 반박이 아니라 '공감으로 빗장 풀기'.

[클로징 4단계 골격 — 각 분기 필수]
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
  "objections": [ { "type": "망설임|거부|의심|재확인", "customer_says": "이 유형이 흔히 하는 말", "reframe_direction": "공감으로 빗장 푸는 방향(반박 아님)", "example": "..." } ]
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

/** 모델 응답 텍스트에서 JSON 객체만 추출해 파싱 (코드펜스 방어) + data_gaps 기본값. */
function parseBrief(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  }
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.data_gaps)) obj.data_gaps = [];
  return obj;
}

export async function POST(request) {
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

  const { phase, member, report } = body || {};
  if (phase !== "first" && phase !== "second") {
    return Response.json({ error: "phase는 'first' 또는 'second'여야 합니다." }, { status: 400 });
  }

  const model = phase === "first" ? MODEL_FIRST : MODEL_SECOND;
  const prompt = phase === "first" ? firstPrompt(member) : secondPrompt(member, report);
  // ① 확정 스키마 출력 ~5.5k 토큰 → 8192 필수(4096이면 JSON 잘려 파싱 불가). ③(Sonnet)은 5120 유지.
  const maxTokens = phase === "first" ? 8192 : 5120;

  try {
    const anthropic = new Anthropic({ apiKey });
    const req = {
      model,
      max_tokens: maxTokens,
      system: PREAMBLE,
      messages: [{ role: "user", content: prompt }],
    };
    // sonnet-5는 기본이 adaptive thinking이라 JSON 생성엔 불필요 → 끔(haiku는 기본 off).
    if (phase === "second") req.thinking = { type: "disabled" };

    const msg = await anthropic.messages.create(req);
    const textOut = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const brief = sanitizeFieldNames(parseBrief(textOut));
    return Response.json(brief);
  } catch (e) {
    return Response.json(
      { error: "AI 생성에 실패했습니다: " + (e?.message || "unknown") },
      { status: 502 }
    );
  }
}

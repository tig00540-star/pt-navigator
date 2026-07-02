// app/api/ot-brief/route.js
// -----------------------------------------------------------------------------
// OT 여정 AI 지원 (서버 전용). 순수 생성기 — 캐시는 클라이언트가 담당.
//   phase "first"  → ① 1차 지원 (haiku): 기본정보+사전메모 → 가설·observe_targets·arc·soft_closing
//   phase "second" → ③ 2차 지원 (sonnet): 1차 관찰 → 등록 당위성 브리핑·arc·closing 3분기·objections
// system = 가드레일 프리앰블(스파링 파트너/환각 금지/윤리/출력규칙, 문자 그대로).
// 키 미설정·API 실패·JSON 파싱 실패 → 명확한 상태코드 (프론트가 데모 폴백 판별).
// -----------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

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

// ① phase="first" user 프롬프트
function firstPrompt(member, preNote) {
  const m = member || {};
  const machines = Array.isArray(m.machines) ? m.machines.join(", ") : g(m.machines);
  return `[상황] 1차 OT 전/중. 아직 관찰 데이터가 없다 — 아래는 관찰이 아니라 '사전 정보'다.
[회원 기본정보] name=${g(m.name)}, age=${g(m.age)}, job=${g(m.job)}, residence=${g(m.residence)},
               mbti=${g(m.mbti)}, pain=${g(m.pain)}, goal=${g(m.goal)}, machines=${machines}
[트레이너 사전 메모/인바디 요약] ${g(preNote)}

기본정보만으로 1차 OT를 지원하라. 관찰이 아니므로 모든 판단은 '가설'임을 전제한다("~일 가능성" 톤).
1) hypothesis: 이 회원 접근 가설 방향. 단정 금지.
2) observe_targets: 1차에서 실제로 관찰해와야 할 것. 트레이너가 관찰기록 탭에 그대로 옮겨
   확인할 수 있도록 '관찰 가능한 행동/움직임 단위'로 작성.
3) arc: 1차 대화 흐름(도입→중반→후반→마무리). 각 비트 when/intent/direction/tone/example.
4) soft_closing: 1차 마무리의 부담 없는 클로징. 강요·긴급성 금지.
정보가 얇으면 지어내지 말고 data_gaps에 남겨라.

아래 JSON 스키마만 출력(설명·코드펜스 금지):
{
  "data_gaps": ["..."],
  "hypothesis": "기본정보 기반 접근 가설(관찰 아님 명시)",
  "observe_targets": ["1차에서 관찰해올 것 (관찰 단위)"],
  "arc": [ { "when": "...", "intent": "...", "direction": "...", "example": "...", "tone": "..." } ],
  "soft_closing": { "approach_tag": "value|pain|appearance|other", "logic": "...", "example": "..." }
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
관찰이 빈약하면 단정 말고 data_gaps에 남겨라.

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

  const { phase, member, report, preNote } = body || {};
  if (phase !== "first" && phase !== "second") {
    return Response.json({ error: "phase는 'first' 또는 'second'여야 합니다." }, { status: 400 });
  }

  const model = phase === "first" ? MODEL_FIRST : MODEL_SECOND;
  const prompt = phase === "first" ? firstPrompt(member, preNote) : secondPrompt(member, report);
  const maxTokens = phase === "first" ? 2048 : 5120;

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
    const brief = parseBrief(textOut);
    return Response.json(brief);
  } catch (e) {
    return Response.json(
      { error: "AI 생성에 실패했습니다: " + (e?.message || "unknown") },
      { status: 502 }
    );
  }
}

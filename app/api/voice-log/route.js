// app/api/voice-log/route.js
// -----------------------------------------------------------------------------
// 음성일지 실 AI 파이프라인 (서버 전용).
//   [오디오 Blob] → OpenAI STT(gpt-4o-mini-transcribe, 한국어)
//                 → Claude Haiku 요약(리포트 JSON)
//   반환: { raw_text, report }
// 키(OPENAI_API_KEY / ANTHROPIC_API_KEY)는 이 라우트 안에서만 사용 — 프론트 노출 금지.
// 키 미설정/에러 시 명확한 상태코드로 응답 → 클라이언트가 데모 폴백.
// -----------------------------------------------------------------------------
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";

export const runtime = "nodejs"; // SDK는 Node 런타임 필요 (Edge 불가)

const STT_MODEL = "gpt-4o-mini-transcribe";
const SUMMARY_MODEL = "claude-sonnet-5"; // 운동방법 깊이 위해 Sonnet(ot-brief 2차와 동일). Haiku 테스트 시 이 줄만 원복.

// STT 어휘 힌트 — 헬스 PT 도메인 용어를 prompt로 흘려 오인식 저감(gpt-4o-*-transcribe의 prompt 파라미터).
const STT_PROMPT_BASE = "헬스 PT 수업 구두 요약. 운동·머신명과 중량·횟수·세트가 나옵니다. 예: 벤치프레스, 인클라인벤치프레스, 레그프레스, 스쿼트, 데드리프트, 랫풀다운, 시티드로우, 숄더프레스, 힙어브덕션, 힙쓰러스트, 레그익스텐션, 레그컬, 케이블, 덤벨, 바벨, 스미스머신, kg, 회, 세트.";

// AI는 트레이너가 말한 내용만 재구성한다 — 언급 안 된 중량·세트·운동을 지어내지 않는다.
const SUMMARY_SYSTEM = `당신은 PT 트레이너의 수업 종료 구두 요약(한국어 STT 텍스트)을, 회원에게 카톡으로 보내는 '자세하고 실전적인' 운동 일지로 정제하는 도우미입니다. 회원이 이 일지만 보고도 혼자 정확히 운동할 수 있을 만큼 구체적으로 씁니다.

규칙:
- [오늘 한 사실은 트레이너 말만] 오늘 진행한 운동 종류·중량·횟수·세트는 트레이너가 실제로 말한 것만 씁니다. 말하지 않은 머신·중량·세트를 지어내지 마세요. 말한 수치는 그대로 살립니다.
- [STT 오인식 교정] 발음이 비슷해 잘못 옮긴 운동명·단어는 문맥상 명백하면 올바른 표기로 교정(예: "벤치프러스"→"벤치프레스", "아웃싸이"→"아웃타이(힙어브덕션)", "20거"→"20개"). '표기 복원'만 — 수량·운동 종류 값은 바꾸지 마세요. 애매하면 원문 보존. 또한 아래 사용자 메시지에 [이 회원 주 사용 머신] 목록이 주어지면, 트레이너가 말한 머신·운동명이 그 목록의 항목과 명백히 같은 것을 가리킬 땐 목록의 정확한 표기를 name에 그대로 복원하세요(예: STT가 "로우로 머신"으로 받아썼고 목록에 "로우로우 머신"이 있으면 name은 "로우로우 머신"). 반복처럼 보이는 음절을 STT 중복으로 단정해 줄이지 마세요. name은 트레이너 표현/목록 표기를 보존하고, 표기 통일은 canonical에서만 하세요.
- [운동별 method는 트레이너처럼 구체적으로 · 가장 중요] 언급된 각 운동마다 method 배열에 '실전 실행 큐'를 3~6개 넣으세요. "바른 자세로 하세요" 같은 뭉뚱그린 일반론 금지. 실제 코칭처럼 구체적으로: 세팅/시작 자세(어디에 어떻게 앉고 잡고) · 힘 쓰는 부위·움직임 감각 · 가동범위·템포(수축/이완, 깊이) · 중량·세트 진행 팁.
  예시(아웃타이/힙어브덕션):
    ["의자 안쪽까지 엉덩이를 밀어넣고 손잡이를 강하게 당겨 가슴을 든 상태로 진행",
     "발바닥 힘보다 무릎에 힘을 실어 양쪽으로 밀어낸다 생각하고 진행",
     "이완은 짧게, 수축은 깊게 (밀어내는 게 수축)",
     "고관절까지 적극적으로 풀어준다 생각하고 중량을 최대한 올려 진행",
     "중량을 적극적으로 올려가며 20개씩 5세트"]
  이 깊이·구체성을 모든 운동에 적용하세요. 트레이너가 짚은 포인트가 있으면 반드시 반영하고, 없는 부분은 그 운동의 표준 정석 큐로 채웁니다(표준 지식이라 '지어내기' 아님). 비우거나 한 줄로 줄이지 마세요.
  ⚠️ 의료·치료·진단 표현 금지 — 통증·부상·질환을 '치료/완치/교정'한다고 단정하지 마세요.
  ⚠️ 통증·부상·불편이 언급되면 "무리하지 말고 전문가(트레이너/병원)와 상의" 방향으로만, 통증을 특정 각도·세트·중량으로 다루라는 처방으로 가지 마세요.
- feedback: 오늘 수업 핵심을 따뜻하게 2~3문장.
- homework: 집에서 참고할 종합 팁·주의사항(스트레칭·자세 습관 등 특정 머신에 안 묶인 것)이 있으면 넣고, 없으면 빈 배열.
- 톤: 회원에게 보내는 따뜻하고 명료한 존댓말.
- [구조화 수치 sets — 그래프용 · 트레이너 말만] 각 운동마다 트레이너가 **명시적으로 말한** 세트를 sets 배열에 숫자로 넣으세요. weight=중량(kg 숫자, 맨몸·중량 미언급이면 null), reps=반복 횟수(숫자, 미언급이면 null). 예: "20kg 12개 3세트" → [{"weight":20,"reps":12},{"weight":20,"reps":12},{"weight":20,"reps":12}]. "20·30·40 순으로 12개씩" → [{"weight":20,"reps":12},{"weight":30,"reps":12},{"weight":40,"reps":12}]. **말하지 않은 수치를 지어내지 마세요** — 애매하면 그 필드/세트는 null 또는 sets=[]. 범위("12~15개")는 대표값 1개 또는 null. detail(사람용 텍스트)은 종전대로 유지하세요 — sets와 별개(카톡·표시용).
- [canonical 정규화 — 집계 키] canonical은 같은 운동이 날마다 같은 문자열로 모이게 하는 키입니다. 표기 흔들림(띄어쓰기·영한 혼용·약칭)을 제거하고 대표 한글 정식명으로. 예: "벤치/벤치 프레스/bench"→"벤치프레스", "랫풀/lat pull"→"랫풀다운". 아래 표준 종목을 우선 사용하되, 목록 밖이면 같은 원칙으로 명명하세요. name(트레이너 표현)은 그대로 두고 canonical만 통일합니다.
  표준 종목: 벤치프레스, 인클라인벤치프레스, 레그프레스, 스쿼트, 데드리프트, 랫풀다운, 시티드로우, 숄더프레스, 힙어브덕션, 힙쓰러스트, 레그익스텐션, 레그컬, 케이블크로스오버, 체스트프레스, 풀업, 푸시업, 플랭크.
- 반드시 아래 스키마의 JSON "만" 출력하세요. 코드펜스·설명·머리말 없이 순수 JSON 객체 하나만.

스키마:
{
  "machines": [{
    "name": "머신·운동명(트레이너 표현 그대로 · STT 교정 반영)",
    "canonical": "정규화 종목명(그래프 집계 키)",
    "sets": [{ "weight": 20, "reps": 12 }],
    "detail": "사람이 읽는 중량·세트 요약(기존 유지 · 예: 20kg 12회 3세트)",
    "method": ["구체 실행 큐", "..."]
  }],
  "feedback": "핵심 피드백 2~3문장",
  "homework": ["집에서 참고할 종합 팁·주의사항", "..."]
}`;

// 세트 배열 정규화 — 숫자만, null 허용, 둘 다 없으면 버림.
function normSets(arr) {
  if (!Array.isArray(arr)) return [];
  const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return arr
    .map((s) => ({ weight: num(s?.weight), reps: num(s?.reps) }))
    .filter((s) => s.weight != null || s.reps != null);
}

/** Claude 응답 텍스트에서 JSON 객체만 추출해 파싱 (코드펜스 방어). */
function parseReport(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  }
  const obj = JSON.parse(text.slice(start, end + 1));
  return {
    machines: (Array.isArray(obj.machines) ? obj.machines : []).map((m) => ({
      name: typeof m?.name === "string" ? m.name : "",
      canonical:
        typeof m?.canonical === "string" && m.canonical.trim()
          ? m.canonical.trim()
          : (typeof m?.name === "string" ? m.name.trim() : ""),
      sets: normSets(m?.sets),
      detail: typeof m?.detail === "string" ? m.detail : "",
      method: Array.isArray(m?.method) ? m.method : [],
    })),
    feedback: typeof obj.feedback === "string" ? obj.feedback : "",
    homework: Array.isArray(obj.homework) ? obj.homework : [],
  };
}

export async function POST(request) {
  const auth = await requireTrainer(request);
  if (!auth.ok) return auth.res;

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // 키 미설정 → 데모 폴백을 클라이언트가 타도록 503.
  if (!openaiKey || !anthropicKey) {
    return Response.json(
      { error: "AI 키가 설정되지 않았습니다. 데모 모드로 동작합니다." },
      { status: 503 }
    );
  }

  let audio;
  let machines = "";
  try {
    const form = await request.formData();
    audio = form.get("audio");
    machines = (form.get("machines") || "").toString().trim();
  } catch {
    return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 });
  }
  if (!audio || typeof audio === "string") {
    return Response.json({ error: "audio 파일이 없습니다." }, { status: 400 });
  }

  // 1) STT — 오디오 파일을 그대로 multipart 전달 (포맷/확장자는 클라이언트가 맞춤).
  let rawText;
  try {
    const openai = new OpenAI({ apiKey: openaiKey });
    const sttPrompt = machines ? `${STT_PROMPT_BASE} 이 회원 사용 머신: ${machines}.` : STT_PROMPT_BASE;
    const tr = await openai.audio.transcriptions.create({
      file: audio,
      model: STT_MODEL,
      language: "ko",
      prompt: sttPrompt,
    });
    rawText = (tr.text || "").trim();
  } catch (e) {
    return Response.json(
      { error: "음성 인식(STT)에 실패했습니다: " + (e?.message || "unknown") },
      { status: 502 }
    );
  }

  if (!rawText) {
    return Response.json(
      { error: "녹음에서 텍스트를 추출하지 못했습니다. 더 또렷하게 다시 녹음해 주세요." },
      { status: 422 }
    );
  }

  // 2) 요약 — Claude Haiku (effort 미지원 모델이라 output_config.effort 사용 안 함).
  let report;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const msg = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 4096, // 운동별 method 다건 → 여유
      thinking: { type: "disabled" }, // sonnet-5 기본 adaptive thinking 끔(JSON 생성엔 불필요·ot-brief 패턴)
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `다음은 트레이너가 수업 종료 시 구두로 남긴 요약(STT 원본)입니다. 규칙에 맞춰 JSON으로 정제하세요.\n\n---\n${rawText}\n---` + (machines ? `\n\n[참고 · 이 회원 주 사용 머신: ${machines}] (오인식 표기 교정 시 이 목록을 우선 참고. 단, 목록에 없는 운동을 지어내지는 말 것.)` : ""),
        },
      ],
    });
    const textOut = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    report = parseReport(textOut);
  } catch (e) {
    return Response.json(
      { error: "AI 요약에 실패했습니다: " + (e?.message || "unknown") },
      { status: 502 }
    );
  }

  return Response.json({ raw_text: rawText, report });
}

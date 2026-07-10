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

export const runtime = "nodejs"; // SDK는 Node 런타임 필요 (Edge 불가)

const STT_MODEL = "gpt-4o-mini-transcribe";
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";

// STT 어휘 힌트 — 헬스 PT 도메인 용어를 prompt로 흘려 오인식 저감(gpt-4o-*-transcribe의 prompt 파라미터).
const STT_PROMPT_BASE = "헬스 PT 수업 구두 요약. 운동·머신명과 중량·횟수·세트가 나옵니다. 예: 벤치프레스, 인클라인벤치프레스, 레그프레스, 스쿼트, 데드리프트, 랫풀다운, 시티드로우, 숄더프레스, 힙어브덕션, 힙쓰러스트, 레그익스텐션, 레그컬, 케이블, 덤벨, 바벨, 스미스머신, kg, 회, 세트.";

// AI는 트레이너가 말한 내용만 재구성한다 — 언급 안 된 중량·세트·운동을 지어내지 않는다.
const SUMMARY_SYSTEM = `당신은 PT 트레이너의 수업 종료 구두 요약(한국어 STT 텍스트)을 회원에게 카톡으로 보내는 운동 일지로 정제하는 도우미입니다.

규칙:
- [오늘 한 사실은 트레이너 말만] 오늘 진행한 운동 종류·중량·횟수·세트는 트레이너가 실제로 말한 것만 쓰세요. 말하지 않은 머신·중량·세트를 지어내지 마세요. 트레이너가 말한 수치는 그대로 살리세요.
- [STT 오인식 교정] 발음이 비슷해 잘못 옮긴 운동명·단어는 문맥상 명백하면 올바른 표기로 교정하세요(예: "벤치프러스"→"벤치프레스", "20거"→"20개", "3세우"→"3세트"). '표기 복원'만입니다 — 수량·운동 종류 값은 바꾸지 마세요(10kg를 다른 무게로 바꾸기 금지). 애매하면 원문 보존.
- [운동방법·주의사항은 풍부하게 · 핵심] homework에는 오늘 언급된 각 운동마다, 회원이 혼자 운동할 때 도움이 되도록 수행 방법과 주의사항을 '자세히' 채우세요. 트레이너가 짚은 포인트가 있으면 우선 담고, 없더라도 그 운동의 표준적인 올바른 자세·호흡·자주 하는 실수·집에서 참고할 팁을 충분히 제공하세요. 이는 트레이너가 가르친 운동에 대한 표준 지식이므로 '지어내기'가 아니며, 비우거나 최소로 줄이지 마세요 — 회원의 개인운동 만족도를 높이는 것이 목적입니다.
  ⚠️ 단, 의료·치료·진단 표현은 금지 — 통증·부상·질환을 '치료/완치/교정'한다는 식으로 단정하지 마세요.
  ⚠️ 통증·부상·불편이 언급되면 "무리하지 말고 전문가(트레이너/병원)와 상의" 방향으로만 안내하고, 통증을 특정 각도·세트·중량으로 다루라는 구체적 처방으로 가지 마세요.
- 톤: 회원에게 보내는 따뜻하고 명료한 존댓말. 친절하고 구체적으로.
- 반드시 아래 스키마의 JSON "만" 출력하세요. 코드펜스·설명·머리말 없이 순수 JSON 객체 하나만.

스키마:
{
  "machines": [{ "name": "머신명", "detail": "중량·세트 (트레이너가 말한 경우만, 없으면 빈 문자열)" }],
  "feedback": "오늘 수업 핵심 피드백 (따뜻하게 2~3문장)",
  "homework": ["운동별 수행 방법·주의사항 항목(자세·호흡·실수·팁)", "..."]
}

machines·feedback은 트레이너가 말한 내용 기준으로 채우고(없는 사실은 지어내지 말 것), homework는 위 규칙대로 언급된 운동에 대해 '자세하고 충분하게' 채우세요.`;

/** Claude 응답 텍스트에서 JSON 객체만 추출해 파싱 (코드펜스 방어). */
function parseReport(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  }
  const obj = JSON.parse(text.slice(start, end + 1));
  return {
    machines: Array.isArray(obj.machines) ? obj.machines : [],
    feedback: typeof obj.feedback === "string" ? obj.feedback : "",
    homework: Array.isArray(obj.homework) ? obj.homework : [],
  };
}

export async function POST(request) {
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
      max_tokens: 2048, // homework 풍부화 → 출력 여유(1536→2048, JSON 잘림 방지)
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

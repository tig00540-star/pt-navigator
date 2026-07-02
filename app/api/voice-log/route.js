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

// AI는 트레이너가 말한 내용만 재구성한다 — 언급 안 된 중량·세트·운동을 지어내지 않는다.
const SUMMARY_SYSTEM = `당신은 PT 트레이너의 수업 종료 구두 요약(한국어 STT 텍스트)을 회원 카톡 전송용 운동 일지로 정제하는 도우미입니다.

규칙:
- 트레이너가 실제로 말한 내용만 재구성하세요. 언급되지 않은 머신·중량·세트·운동을 절대 지어내지 마세요.
- 트레이너가 말한 수치(중량·횟수·세트)는 그대로 살리세요.
- 톤: 회원에게 보내는 따뜻하고 명료한 존댓말.
- 반드시 아래 스키마의 JSON "만" 출력하세요. 코드펜스·설명·머리말 없이 순수 JSON 객체 하나만.

스키마:
{
  "machines": [{ "name": "머신명", "detail": "중량·세트 (트레이너가 말한 경우만, 없으면 빈 문자열)" }],
  "feedback": "오늘 수업 핵심 피드백 1~2문장",
  "homework": ["홈트/주의사항 항목", "..."]
}

정보가 부족하면 해당 배열을 비우거나(feedback은 말한 내용 요약) 최소한으로 채우세요. 지어내기보다 비우는 편이 낫습니다.`;

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
  try {
    const form = await request.formData();
    audio = form.get("audio");
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
    const tr = await openai.audio.transcriptions.create({
      file: audio,
      model: STT_MODEL,
      language: "ko",
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
      max_tokens: 1024,
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `다음은 트레이너가 수업 종료 시 구두로 남긴 요약(STT 원본)입니다. 규칙에 맞춰 JSON으로 정제하세요.\n\n---\n${rawText}\n---`,
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

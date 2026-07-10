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
const SUMMARY_SYSTEM = `당신은 PT 트레이너의 수업 종료 구두 요약(한국어 STT 텍스트)을 회원 카톡 전송용 운동 일지로 정제하는 도우미입니다.

규칙:
- 트레이너가 실제로 말한 내용만 재구성하세요. 언급되지 않은 머신·중량·세트·운동을 절대 지어내지 마세요.
- 트레이너가 말한 수치(중량·횟수·세트)는 그대로 살리세요.
- [STT 오인식 교정] STT가 발음이 비슷해 잘못 옮긴 운동명·단어는 문맥상 명백하면 올바른 표기로 교정하세요
  (예: "벤치프러스"→"벤치프레스", "레그프래스"→"레그프레스", "20거"→"20개", "3세우"→"3세트").
  ⚠️ 교정은 '표기 복원'만입니다. 트레이너가 말한 수량·운동 종류 자체는 바꾸지 마세요(10kg를 다른 무게로,
  벤치프레스를 다른 운동으로 바꾸는 것 금지). 애매하면 원문을 살리세요. 이는 "수치는 그대로 살리세요"와
  충돌하지 않습니다 — 오청 표기만 고치고 값은 보존합니다.
- [운동방법·유의점] homework에는 트레이너가 실제로 짚은 자세·호흡·주의점을 우선 정리하세요. 트레이너가
  말하지 않았어도 그 운동의 '일반적' 수행 팁·유의점을 간략히 덧붙일 수 있으나, 보수적·일반적 수준으로만
  (과장·단정 금지, 회원이 집에서 무리하지 않게).
  ⚠️ 의료·치료·진단 표현 금지 — 통증·부상·질환을 '치료/완치/교정'한다는 식으로 단정하지 마세요.
  ⚠️ 통증·부상·불편이 언급되면 "무리하지 말고 전문가(트레이너/병원)와 상의" 방향으로만 안내하고,
  구체적 처방(각도·세트·중량으로 통증을 다루라는 식)으로 가지 마세요.
  트레이너가 말한 것과 일반 팁이 섞일 땐 회원이 오해하지 않게 자연스럽게 통합하세요(별도 라벨 불필요).
- 톤: 회원에게 보내는 따뜻하고 명료한 존댓말.
- 반드시 아래 스키마의 JSON "만" 출력하세요. 코드펜스·설명·머리말 없이 순수 JSON 객체 하나만.

스키마:
{
  "machines": [{ "name": "머신명", "detail": "중량·세트 (트레이너가 말한 경우만, 없으면 빈 문자열)" }],
  "feedback": "오늘 수업 핵심 피드백 1~2문장",
  "homework": ["홈트/방법·유의점 항목", "..."]
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
      max_tokens: 1536, // 1b-B: homework에 운동방법·유의점 추가 → 출력 여유(1024→1536, JSON 잘림 방지)
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

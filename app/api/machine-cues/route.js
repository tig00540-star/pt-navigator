// 머신별 실행 큐 'AI 초안' 생성(서버 전용). 보유장비 등록/수정 시 1회성 on-demand.
//   입력 { name, brand, kind, spec } → Claude(Sonnet) → { cues: string[] }
//   저장은 클라가 center_machine.cues로(대표 RLS). 이 라우트는 생성만.
import Anthropic from "@anthropic-ai/sdk";
import { requireTrainer } from "@/lib/requireTrainer";

export const runtime = "nodejs";
export const maxDuration = 60; // Sonnet 호출 → Vercel 함수 타임아웃 상향(기본값이면 여유 없음)
const CUE_MODEL = "claude-sonnet-5"; // voice-log SUMMARY_MODEL과 동일 id 사용
const KIND_LABEL = { machine: "머신", free_weight: "프리웨이트", bodyweight: "맨몸/도구" };

const SYSTEM = `당신은 PT 트레이너를 돕는 도우미입니다. 주어진 운동 기구 정보로, 트레이너가 회원 운동일지에 쓸 '실전 실행 큐' 초안을 만듭니다.

규칙:
- 큐 3~6개. 각 큐는 실제 코칭처럼 구체적으로: 세팅/시작 자세(어디에 어떻게 앉고 잡고) · 힘 쓰는 부위·움직임 감각 · 가동범위·템포(수축/이완, 깊이) · 중량·세트 진행 팁. "바른 자세로" 같은 뭉뚱그린 일반론 금지.
- 종류·브랜드·규격으로 판단하되, 모르는 특정 모델 스펙을 지어내지 말고 그 기구 계열의 표준 정석 큐로.
- 유사 계열(로우로우/하이로우/시티드로우 등)은 그 기구만의 각도·궤적·타깃을 반영해 구분되게.
- ⚠️ 의료·치료·진단 표현 금지. 통증·부상을 특정 각도·중량으로 다루는 처방 금지.
- 트레이너가 다듬어 쓸 '초안'. 회원에게 보내는 존댓말 큐 문장으로.
- 반드시 JSON "만" 출력: {"cues":["큐1","큐2", ...]}. 코드펜스·설명 없이 순수 JSON 하나.`;

export async function POST(request) {
  const auth = await requireTrainer(request);
  if (!auth.ok) return auth.res;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return Response.json({ error: "AI 키가 설정되지 않았습니다." }, { status: 503 });

  let name = "", brand = "", kind = "", spec = "";
  try {
    const b = await request.json();
    name = (b?.name || "").toString().trim();
    brand = (b?.brand || "").toString().trim();
    kind = (b?.kind || "").toString().trim();
    spec = (b?.spec || "").toString().trim();
  } catch { return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 }); }
  if (!name) return Response.json({ error: "장비 이름이 필요합니다." }, { status: 400 });

  const info = [`이름: ${name}`, brand ? `브랜드: ${brand}` : null, `종류: ${KIND_LABEL[kind] || kind || "미상"}`, spec ? `규격: ${spec}` : null].filter(Boolean).join("\n");

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const msg = await anthropic.messages.create({
      model: CUE_MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: SYSTEM,
      messages: [{ role: "user", content: `다음 기구의 실행 큐 초안을 만들어 주세요.\n\n${info}` }],
    });
    const out = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
    const s = out.indexOf("{"), e = out.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("파싱 실패");
    const obj = JSON.parse(out.slice(s, e + 1));
    const cues = Array.isArray(obj.cues) ? obj.cues.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()) : [];
    return Response.json({ cues });
  } catch (err) {
    return Response.json({ error: "AI 초안 생성 실패: " + (err?.message || "unknown") }, { status: 502 });
  }
}

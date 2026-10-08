// app/api/member-portfolio/route.js — 회원 '트레이너 포트폴리오 활용 동의' 켜기 · 끄기(2026-10-08)
//   POST {agree:boolean} (회원 세션). 켜기 = 지금 담당 트레이너 아이디에 묶인 동의 행.
//   끄기 = trainer_id 없는 철회 행(모든 트레이너) + 다른 아이디로 복사된 사례(data.portfolio.member = 나)와 그 사진 파일을 지운다.
//   서버 라우트인 이유: 철회 때 다른 계정에 있는 복사본까지 지워야 해서(회원 세션으로는 못 지움).
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { PORTFOLIO_VERSION } from "@/lib/consent";
import { caseFiles } from "@/lib/portfolio";

export const runtime = "nodejs";

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "member") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const { agree } = await req.json().catch(() => ({}));
  if (typeof agree !== "boolean") return Response.json({ error: "다시 시도해 주세요." }, { status: 400 });
  if (agree && !me.trainer_id) return Response.json({ error: "담당 트레이너가 정해진 뒤에 동의할 수 있어요." }, { status: 409 });

  const { data, error } = await sb.from("member_consent").insert({
    member_id: me.id, kind: "portfolio", agreed: agree, method: "member_page",
    version: PORTFOLIO_VERSION, trainer_id: agree ? me.trainer_id : null,
  }).select("kind, agreed, created_at, version");
  if (error || !data?.length) {
    console.error("[member-portfolio] 동의 저장 실패", error?.message);
    return Response.json({ error: "바꾸지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  }

  let removed = 0;
  if (!agree) {
    const { data: copies } = await sb.from("sales_case").select("id, kind, data").filter("data->portfolio->>member", "eq", me.id);
    for (const c of copies || []) {
      const files = caseFiles(c).filter((f) => f.bucket === "sales-cases").map((f) => f.path);
      if (files.length) await sb.storage.from("sales-cases").remove(files).catch(() => {});
      const { error: de } = await sb.from("sales_case").delete().eq("id", c.id);
      if (!de) removed++;
    }
  }
  return Response.json({ ok: true, rows: data, removed });
}

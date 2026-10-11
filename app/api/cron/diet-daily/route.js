// app/api/cron/diet-daily — 매일 오전 6시대(KST) 식단 마감(2026-10-11 · 1단계).
//   ① 트레이너가 안 보낸 어제 하루 피드백 · 1시간 지난 요청(1 · 2번째)을 AI가 대신(lib/dietAI runDietAuto · 회원 · 트레이너가 앱을 열 때도 같은 함수).
//   ② 회원 페이지가 닫힌 지난 회원(PT 종료 6개월)의 식단 사진 삭제(숫자 · 피드백 글은 남김 · 대표 결정).
//   인증: Authorization: Bearer <CRON_SECRET>. 점검: ?member=<id> 로 한 회원만.
import { bearerOk } from "@/lib/bearerOk";
import { serviceClient } from "@/lib/serverCaller";
import { runDietAuto } from "@/lib/dietAI";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req) {
  if (!bearerOk(req, process.env.CRON_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "no_service" }, { status: 503 });
  const t0 = Date.now();
  const only = new URL(req.url).searchParams.get("member");

  const { data: plans } = only ? { data: [{ member_id: only }] }
    : await fetchAllRows(() => sb.from("diet_plan").select("member_id").eq("enabled", true));
  const ids = (plans || []).map((p) => p.member_id);
  const total = { requests: 0, feedbacks: 0, skipped: 0 };
  // 50명씩 · 시간 안에 끝나게(남은 건 회원 · 트레이너가 앱을 열 때 이어서)
  for (let i = 0; i < ids.length && Date.now() - t0 < 250000; i += 50) {
    const r = await runDietAuto(sb, ids.slice(i, i + 50));
    total.requests += r.requests; total.feedbacks += r.feedbacks; total.skipped += r.skipped;
  }

  // 회원 페이지가 닫힌 지난 회원(종료 6개월 지남)의 식단 사진 지우기
  let purged = 0;
  if (!only) {
    const cut = new Date(Date.now() - 183 * 86400000).toISOString();
    const { data: gone } = await fetchAllRows(() => sb.from("user_table").select("id").eq("status", "inactive").lt("status_changed_at", cut));
    const goneIds = (gone || []).map((g) => g.id);
    for (let i = 0; i < goneIds.length && Date.now() - t0 < 280000; i += 100) {
      const { data: meals } = await sb.from("diet_meal").select("id, photo_path").in("user_id", goneIds.slice(i, i + 100)).not("photo_path", "is", null).limit(1000);
      const paths = (meals || []).map((m) => m.photo_path);
      if (!paths.length) continue;
      const { error } = await sb.storage.from("diet-photos").remove(paths);
      if (error) { console.error("[diet-daily] 사진 삭제 실패", error.message); continue; }
      await sb.from("diet_meal").update({ photo_path: null, memo: "사진 보관 기간이 끝났어요" }).in("id", meals.map((m) => m.id));
      purged += paths.length;
    }
  }
  return Response.json({ ok: true, members: ids.length, ...total, purged, ms: Date.now() - t0 });
}

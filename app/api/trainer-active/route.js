// app/api/trainer-active/route.js — 대표가 트레이너 아이디 끄기 · 다시 켜기(2026-10-08 · 분리 방식)
//   POST {trainerId, active:boolean}. 센터 대표만 · 같은 센터 트레이너(role trainer)만.
//   끄기 = trainer.active=false → 앱 · 데이터 접근이 바로 막힌다(auth_account_id가 active만 봄) · 자리가 빈다.
//          로그인 자체는 막지 않는다 — 그 사람이 새 개인 아이디에서 '내 자료 가져오기'로 본인 것을 복사해 갈 수 있게.
//   켜기 = 자리 확인(create-trainer와 같은 계산) 뒤 active=true. 끈 지 한 달이 지났거나 정리된 아이디는 못 켠다(lib/trainerClose).
//   ⚠️ trainer 표 UPDATE 정책을 열지 않으려고 서버(service_role)에서만 바꾼다.
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { trainerSeatLimit } from "@/lib/plans";
import { trainerCloseAt } from "@/lib/trainerClose";

export const runtime = "nodejs";

export async function POST(req) {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  if (me.role !== "owner") return Response.json({ error: "대표만 바꿀 수 있어요." }, { status: 403 });

  const { trainerId, active } = await req.json().catch(() => ({}));
  if (typeof trainerId !== "string" || typeof active !== "boolean") return Response.json({ error: "다시 시도해 주세요." }, { status: 400 });
  const { data: t } = await sb.from("trainer").select("*").eq("id", trainerId).maybeSingle();
  if (!t || t.account_id !== me.account_id || t.role !== "trainer") return Response.json({ error: "우리 센터 트레이너가 아니에요." }, { status: 404 });
  if (t.active === active) return Response.json({ ok: true, active });

  if (active) {
    const end = trainerCloseAt(t.deactivated_at);
    if (t.closed_at || (end && end <= Date.now())) {
      return Response.json({ error: "끈 지 한 달이 지나 다시 켤 수 없어요. 트레이너 추가로 새 아이디를 만들어 주세요.", code: "closed" }, { status: 409 });
    }
    const { data: acct } = await sb.from("account").select("type, billing_plan, extra_seats, next_extra_seats").eq("id", me.account_id).maybeSingle();
    const seatsPaid = Math.min(acct?.extra_seats ?? 0, acct?.next_extra_seats ?? acct?.extra_seats ?? 0);
    const limit = trainerSeatLimit(acct?.billing_plan || acct?.type || "solo", seatsPaid);
    const { count } = await sb.from("trainer").select("id", { count: "exact", head: true })
      .eq("account_id", me.account_id).eq("role", "trainer").eq("active", true);
    if ((count ?? 0) >= limit) {
      return Response.json({ error: `트레이너 자리 ${limit}개를 모두 쓰고 있어요. 설정 › 구독 관리에서 자리를 추가할 수 있어요.`, code: "seat_limit" }, { status: 409 });
    }
  }
  const upd = (patch) => sb.from("trainer").update(patch).eq("id", trainerId).eq("account_id", me.account_id).select("id, active");
  let { data, error } = await upd({ active, deactivated_at: active ? null : new Date().toISOString(), close_notified_at: null });
  if (error && /deactivated_at|close_notified_at|column/i.test(error.message || "")) ({ data, error } = await upd({ active }));   // SQL 전

  if (error || !data?.length) {
    console.error("[trainer-active] 저장 실패", error?.message);
    return Response.json({ error: "저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  }
  return Response.json({ ok: true, active });
}

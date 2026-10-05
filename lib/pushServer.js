// 폰 푸시 보내기(서버 전용 · 2026-10-06). web-push + VAPID 키(.env · Vercel 환경 변수).
//   키가 없으면 조용히 건너뛴다(앱은 그대로 · 알림만 안 감). 410/404(구독 만료 · 앱 지움)는 그 기기 줄을 지운다.
//   트레이너는 notify_pref.prefs[type] === false면 안 보낸다(없으면 켜짐). 회원은 구독한 기기에만.
import webpush from "web-push";

let ready = null;
function init() {
  if (ready !== null) return ready;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { ready = false; return ready; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://onlytrainer.co.kr", pub, priv);
  ready = true;
  return ready;
}

/** 그 센터의 대표(활성) id들 */
export async function ownerIds(sb, accountId) {
  const { data } = await sb.from("trainer").select("id, active").eq("account_id", accountId).eq("role", "owner");
  return (data || []).filter((t) => t.active !== false).map((t) => t.id);
}

/**
 * @param sb service_role 클라이언트
 * @param {{trainerIds?:string[], memberIds?:string[], type:string, title:string, body:string, url?:string, tag?:string}} msg
 */
export async function sendPush(sb, { trainerIds = [], memberIds = [], type, title, body, url = "/", tag }) {
  if (!init()) return { skipped: "no_keys" };
  let tids = [...new Set(trainerIds.filter(Boolean))];
  const mids = [...new Set(memberIds.filter(Boolean))];
  if (tids.length && type) {
    const { data: prefs } = await sb.from("notify_pref").select("trainer_id, prefs").in("trainer_id", tids);
    const off = new Set((prefs || []).filter((p) => p.prefs?.[type] === false).map((p) => p.trainer_id));
    tids = tids.filter((id) => !off.has(id));
  }
  if (!tids.length && !mids.length) return { sent: 0 };
  const ors = [tids.length && `trainer_id.in.(${tids.join(",")})`, mids.length && `member_id.in.(${mids.join(",")})`].filter(Boolean).join(",");
  const { data: subs, error } = await sb.from("push_subscription").select("id, endpoint, keys").or(ors);
  if (error) { console.error("[push] 구독 읽기 실패", error.message); return { sent: 0 }; }
  const payload = JSON.stringify({ title, body, url, tag: tag || type });
  let sent = 0;
  await Promise.allSettled((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 24 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subscription").delete().eq("id", s.id);
      else console.error("[push] 보내기 실패", e?.statusCode || "", e?.body || e?.message || e);
    }
  }));
  return { sent };
}

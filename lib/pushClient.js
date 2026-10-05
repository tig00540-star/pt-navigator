// 폰 푸시 알림 — 브라우저 쪽(2026-10-06). 트레이너 앱 · 회원 전용 페이지 공용.
//   headers = { Authorization: 'Bearer …' } (트레이너는 lib/authHeader, 회원은 memberSupabase 세션).
//   ⚠️ 아이폰은 '홈 화면에 추가'한 앱으로 열어야만 알림을 받을 수 있다(iOS 16.4+ · 사파리 탭에선 안 됨).
const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(KEY);
export const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

function keyBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  return reg;
}

/** 이 기기가 지금 알림을 받는 중인가 */
export async function pushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "ios_install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "on" : "off";
  } catch { return "off"; }
}

/** 알림 켜기 — 권한 묻기 → 구독 → 서버에 등록. 반환: 'on' | 'denied' | 'unsupported' | 'ios_install' | 'error' */
export async function enablePush(headers) {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "ios_install" : "unsupported";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
    const res = await fetch("/api/push/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok ? "on" : "error";
  } catch (e) {
    console.error("알림 켜기 실패", e);
    return "error";
  }
}

/** 이 기기 알림 끄기 */
export async function disablePush(headers) {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
    return "off";
  } catch (e) { console.error("알림 끄기 실패", e); return "error"; }
}

/** 저장 직후 '알림 보내 줘' — 실패해도 화면은 그대로(기다리지 않음). */
export function notifyPush(headersOrPromise, type, id) {
  Promise.resolve(headersOrPromise).then((headers) => fetch("/api/push/notify", {
    method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify({ type, id }), keepalive: true,
  })).catch((e) => console.error("알림 요청 실패", e));
}

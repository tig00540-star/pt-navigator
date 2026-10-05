/* 오직 트레이너 — 서비스 워커(2026-10-06 · 폰 푸시 알림만).
   ⚠️ 캐시는 하지 않는다(옛 화면이 남는 유령 버그 방지 · 배포하면 바로 새 화면). 알림 받기 · 누르기만. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "오직 트레이너", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "오직 트레이너", {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: d.tag || undefined,          // 같은 종류는 하나로 묶여 쌓이지 않게
    renotify: Boolean(d.tag),
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ("navigate" in w) { try { await w.navigate(url); } catch { /* 다른 출처 등 */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

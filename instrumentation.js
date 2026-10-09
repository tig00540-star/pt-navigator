// instrumentation.js — 서버에서 잡히지 않은 오류를 app_error에 남긴다(2026-10-08 · 앱 운영).
//   Next.js가 서버 오류를 잡을 때 부른다(라우트 · 화면 렌더). 회원 토큰 · id는 lib/opsLog가 지운다.
export async function onRequestError(err, request, context) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ serviceClient }, { recordError }] = await Promise.all([import("@/lib/serverCaller"), import("@/lib/opsLog")]);
    await recordError(serviceClient(), {
      source: "server",
      path: `${request?.method || ""} ${request?.path || context?.routePath || ""}`.trim(),
      message: err?.message || String(err),
      digest: err?.digest,
      role: context?.routeType || null,
    });
  } catch { /* 기록 실패는 무시 */ }
}

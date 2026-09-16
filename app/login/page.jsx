"use client";

// /login — 로그인 전용 진입점. 실제 로그인 폼과 세션 처리는 AuthGate가 전담한다:
//  · 로그아웃 상태 → AuthGate가 이 children 대신 로그인 폼을 렌더.
//  · 로그인 상태   → AuthGate effect가 즉시 "/"(앱)로 replace.
// 그래서 이 페이지 본문은 렌더될 일이 거의 없고, 폴백 스피너만 둔다(빈 화면 방지).
export default function LoginRoute() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-sm text-muted">
      불러오는 중…
    </div>
  );
}

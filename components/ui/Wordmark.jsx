/* 브랜드 워드마크 · 슬로건 — 단일 출처(색 드리프트 방지).
   "오직"=ink(검정) + "트레이너"=primary(레드) 2색 대비가 브랜드 규칙이다.
   purge-safe: 클래스는 전부 정적 문자열 리터럴(동적 조립 금지 — CLAUDE.md UI 규약). */

export default function Wordmark({ className = "" }) {
  return (
    <span className={className}>
      <span className="text-ink">오직 </span>
      <span className="text-primary">트레이너</span>
    </span>
  );
}

/* 슬로건. 로그인처럼 브랜드를 크게 보여주는 화면에서만 워드마크 아래에 쓴다. */
export function Slogan({ className = "" }) {
  return (
    <span className={`tracking-[0.25em] text-muted ${className}`}>ONLY FOR TRAINER</span>
  );
}

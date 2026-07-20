/* 브랜드 워드마크 · 슬로건 — 단일 출처(색 드리프트 방지).
   "오직"=ink(검정) + "트레이너"=primary(레드) 2색 대비가 브랜드 규칙이다.
   purge-safe: 클래스는 전부 정적 문자열 리터럴(동적 조립 금지 — CLAUDE.md UI 규약). */

/* ⚠️ whitespace-nowrap 필수 — 워드마크는 브랜드 이름이라 어떤 폭에서도 쪼개지면 안 된다.
   실제로 390px 폰에서 "오직 트레이 / 너"로 단어 중간이 잘렸다(헤더에 셀렉트·버튼 3개가
   같이 있어 공간이 부족). 줄이 바뀌는 게 아니라 글자가 갈라지는 거라 브랜드 훼손이다.
   대신 헤더 쪽에서 다른 요소가 줄어들게 한다(워드마크는 shrink 대상이 아님). */
export default function Wordmark({ className = "" }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
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

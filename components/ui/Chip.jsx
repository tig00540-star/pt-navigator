/* 메타 태그 — MBTI/통증/목표 같은 중립 칩. base: rounded bg-elevate px-1.5 py-0.5 text-[10px].
   muted=true면 흐린 글자(빈/미설정 값). font-weight 없음(=Badge와 구분점). */
export default function Chip({ muted = false, className = "", children }) {
  return (
    <span className={`rounded bg-elevate px-1.5 py-0.5 text-[10px] ${muted ? "text-muted" : "text-sub"} ${className}`}>
      {children}
    </span>
  );
}

/* 빈 상태 한 줄 — "…없어요"류. 지금은 얇지만 이후 리포트/회원앱에서
   아이콘·일러스트 붙일 단일 업그레이드 지점.
   크기·여백은 소비처가 className으로(text-크기 기본값 없음 = 클래스 충돌 방지). */
export default function EmptyState({ children, className = "" }) {
  return <p className={`text-muted ${className}`}>{children}</p>;
}

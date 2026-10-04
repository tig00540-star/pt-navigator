// 사업자·회사 정보 단일 출처(SSOT). 푸터·법적고지·약관·설치안내에서 공용.
// ⚠️ 값은 여기서만 수정 → 전 페이지 자동 반영.
export const COMPANY = {
  name: "오직 트레이너",
  ceo: "황대수",
  bizNo: "287-15-02972",
  mailOrderNo: "", // 통신판매업 신고번호 — 신고 후 기입(예: "2026-인천부평-1234"). 빈 값이면 "신고 예정" 표기.
  address: "인천광역시 부평구 원길로 17, 4층 D413호",
  tel: "010-9788-9970",
  email: "tig00540@naver.com",
  kakao: "https://pf.kakao.com/_xhRHxnX/chat", // 카카오톡 채널 1:1 채팅 링크(문의 버튼 연결).
  effectiveDate: "2026년 8월 1일", // 약관·방침 시행일
  privacyDate: "2026년 10월 5일", // 개인정보처리방침 개정 시행일(민감정보 · 국외 이전 · 회원 페이지 6개월 추가)
  dataRegion: "대한민국(서울)", // Supabase 프로젝트 지역(ap-northeast-2 · 2026-10-05 대시보드 확인) — 저장 위치가 국내라 국외 이전 목록에서 뺐다.
};

// 문의 링크 — 카카오톡 채널이 있으면 그걸로, 없으면 이메일(mailto)로 폴백.
export function contactHref() {
  return COMPANY.kakao || `mailto:${COMPANY.email}`;
}

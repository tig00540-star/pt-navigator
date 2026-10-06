// 데모 계정 — 랜딩 스크린샷·영업 시연용(scripts/demo/seed-demo.mjs가 만든 가짜 센터).
// 실제 고객이 아니므로 운영자 지표(주간 리포트)·고객 관리(노션 동기화)에서 뺀다.
// 데모를 다시 만들면 새 id로 바꾸고, 지우면 목록에서 뺀다(delete-demo.mjs가 안내).
export const DEMO_ACCOUNT_IDS = [
  "21139690-6d31-42cd-808e-dc015f894512", // 강남 피트니스(데모) · 2026-10-02 생성
  "75b6d9ea-9609-4371-8330-ceec4e4c4961", // 개인 · 프리랜서 시험 계정(오프리 PT 스튜디오) · 2026-10-06 · scripts/demo/.solo-credentials.json
];

export const isDemoAccount = (accountId) => DEMO_ACCOUNT_IDS.includes(accountId);

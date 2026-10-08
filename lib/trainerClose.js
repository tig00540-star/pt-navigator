// lib/trainerClose.js — 끈 트레이너 아이디 보관 기간(2026-10-08 · 대표 결정 '한 달').
//   끈 날(trainer.deactivated_at)부터 30일 = 다시 켜기 · 옛 트레이너 '내 자료 가져오기' 가능.
//   지나면 매일 결제 작업(cron charge-subscriptions)이 정리: 로그인 영구 차단 + 이메일을 '정리됨' 주소로 바꿔
//   같은 이메일로 새로 가입할 수 있게 · closed_at. 트레이너 행(이름)은 지난 기록 때문에 남긴다. 회원 넘기기는 기한 없음.
export const TRAINER_KEEP_DAYS = 30;
const DAY = 86400000;

/** 끈 날 → 정리되는 시각(ms) · 끈 날이 없으면 null */
export const trainerCloseAt = (deactivatedAt) => (deactivatedAt ? Date.parse(deactivatedAt) + TRAINER_KEEP_DAYS * DAY : null);

/** "10월 8일" (KST) */
export const kstDay = (ms) => { const d = new Date(ms + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

// 비밀키 대조(2026-10-08 · 서버 전용) — '===' 대신 시간이 일정한 비교(글자를 하나씩 맞춰 보는 공격 막기).
//   비밀키가 비어 있으면 늘 false(설정 실수 = 닫힘).
import crypto from "node:crypto";

export function bearerOk(req, secret) {
  if (!secret) return false;
  const got = req.headers.get("authorization") || "";
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(a, b);
}

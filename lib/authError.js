// Supabase 인증 에러 → 사용자 문구(해요체). 영어 원문은 화면에 안 보여 준다(콘솔로만 · CLAUDE.md '문구 · 숫자 기준').
// 가입 · 비밀번호 바꾸기에서 공용. 모르는 에러는 일반 문구.
export function authErrorKo(error, fallback = "다시 시도해 주세요.") {
  if (!error) return "";
  const code = String(error.code || "");
  const m = String(error.message || "");
  if (code === "weak_password" || /at least|least \d|too short|characters/i.test(m)) return "비밀번호를 6자 이상으로 입력해 주세요.";
  if (code === "user_already_exists" || code === "email_exists" || /already (been )?registered|already exists/i.test(m)) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (code === "email_address_invalid" || /invalid.*email|email.*invalid|unable to validate email/i.test(m)) return "이메일 주소를 다시 확인해 주세요.";
  if (code === "same_password" || /same|different from the old/i.test(m)) return "지금과 다른 비밀번호를 입력해 주세요.";
  if (/rate limit|too many|over_(email_send|request)_rate_limit/i.test(code + " " + m)) return "잠시 뒤에 다시 시도해 주세요.";
  if (/fetch|network/i.test(m)) return "인터넷 연결을 확인하고 다시 시도해 주세요.";
  return fallback;
}

/* 개인정보 · 건강정보 동의 문구 단일 출처(2026-10-05).
   쓰는 곳: 회원 전용 페이지 첫 화면(ConsentGate) · 트레이너 문진 체크(MemberForm) · 인쇄용 동의서(/legal/consent-form).
   기록: member_consent(덧붙이기만 · 철회도 agreed=false 새 행). 문구를 크게 바꾸면 CONSENT_VERSION을 올린다 → 회원 페이지가 다시 묻는다.
   ⚠️ 법률 자문이 아니다. 실제 운영 전 전문가 검토 권장(CLAUDE.md 참고). */

export const CONSENT_VERSION = "2026-10-05";

export const GENERAL_CONSENT = {
  title: "개인정보 수집 · 이용 동의",
  required: true,
  rows: [
    ["모으는 것", "이름, 휴대폰 번호, 운동 목표, 운동일지, 인바디 기록, 직접 올린 사진, 유산소 · 개인운동 기록"],
    ["쓰는 곳", "PT 수업 기록을 보여 드리고, 담당 트레이너가 수업과 개인운동을 관리하는 데만 써요."],
    ["보관 기간", "PT를 이용하는 동안 보관해요. PT가 끝나면 회원 페이지는 6개월 동안 볼 수만 있고, 그 뒤 닫혀요. 센터 기록의 보관 · 파기는 개인정보처리방침을 따라요."],
    ["거부할 권리", "동의하지 않을 수 있어요. 다만 이 동의가 없으면 회원 페이지를 쓸 수 없어요."],
  ],
};

export const HEALTH_CONSENT = {
  title: "건강정보(민감정보) 수집 · 이용 동의",
  required: false,
  rows: [
    ["모으는 것", "불편한 부위, 부상 이력, 개인운동 중 '아파서 멈췄어요' 기록"],
    ["쓰는 곳", "다치지 않게 운동 강도와 종목을 고르는 데만 써요. 진단이나 치료가 아니에요."],
    ["보관 기간", "위 개인정보와 같아요."],
    ["거부할 권리", "동의하지 않아도 회원 페이지와 PT 수업은 그대로 이용할 수 있어요. 다만 통증 기록을 남길 수 없어서, 아프면 바로 멈추고 트레이너에게 직접 말해 주세요."],
  ],
};

export const SAFETY_NOTE = "운동 중 통증이나 어지러움이 있으면 바로 멈추고 트레이너에게 알려 주세요. 이 페이지의 운동 정보는 의료 조언이 아니에요.";

/** 동의 행 배열(최신순 아니어도 됨) → { general, health } 각 kind의 가장 최근 행. */
export function latestConsent(rows) {
  const out = { general: null, health: null };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !(r.kind in out)) continue;
    const cur = out[r.kind];
    if (!cur || (r.created_at || "") > (cur.created_at || "")) out[r.kind] = r;
  }
  return out;
}

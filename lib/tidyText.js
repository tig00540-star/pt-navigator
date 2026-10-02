/* =========================================================================
   AI 출력 마지막 손질(2026-10-02 대표 요청) — 서버 라우트 공용(ot-brief·voice-log·owner-report·machine-cues).
   긴 줄표(—·–)는 한글 문장을 끊어 보이게 하고 기계가 쓴 티를 낸다. 프롬프트로 막아도 섞여 나오면 여기서 바꾼다.
     ① 숫자 사이 줄표는 물결(24–30회 → 24~30회)
     ② 문장 끝(요·다·죠·까·네) 뒤 줄표는 마침표
     ③ 물음표·느낌표·마침표 뒤 줄표는 지움 · 맨 앞·맨 뒤 줄표도 지움
     ④ 나머지는 쉼표
   **강조**(components/ui/Emph가 포인트 색으로 칠함)는 keepEmph일 때만 남기고, 아니면 별표를 지운다.
   ========================================================================= */

export function tidyDashes(s) {
  return s
    .replace(/(\d)\s*[—–―]\s*(\d)/g, "$1~$2")
    .replace(/([요다죠까네])\s*[—–―]\s*/g, "$1. ")
    .replace(/([?!.])\s*[—–―]\s*/g, "$1 ")
    .replace(/\s*[—–―]+\s*$/g, "")
    .replace(/^\s*[—–―]+\s*/g, "")
    .replace(/\s*[—–―]+\s*/g, ", ");
}

export function tidyDeep(node, keepEmph = false) {
  if (typeof node === "string") {
    const t = tidyDashes(node);
    return keepEmph ? t : t.replace(/\*\*/g, "");
  }
  if (Array.isArray(node)) return node.map((x) => tidyDeep(x, keepEmph));
  if (node && typeof node === "object") {
    const o = {};
    for (const key of Object.keys(node)) o[key] = tidyDeep(node[key], keepEmph);
    return o;
  }
  return node;
}

// AI에게 주는 한 줄 규칙(프롬프트 끝에 붙인다).
export const NO_DASH_RULE = "긴 줄표(—, –)는 쓰지 마라. 문장을 끊어야 하면 마침표로 나누고, 이어야 하면 쉼표를 써라.";

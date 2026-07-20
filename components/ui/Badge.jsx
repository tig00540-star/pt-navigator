/* 상태·역할 알약 라벨 — 신규/재등록/환불/선택됨/필수확인/스테일 등.
   규격 출처: DS components/core/Badge.prompt.md. 구현은 앱 Tailwind.

   ── 역할색이 사는 곳 ──
   그동안 amber/sky/rose를 화면에서 직접 골라 썼는데(text-amber-700 32곳 등),
   그러면 "이 amber가 OT라서인지 그냥 노랑인지"가 코드에 안 남는다.
   여기 tone 하나로 수렴시키고 색은 역할 토큰(--color-ot 등)에서 가져온다.

   ── 규율 ──
   · 채움값(ot/pt/admin)은 글자색으로 단독 사용 금지 — 밝은 배경에서 대비 미달
     (amber #f59e0b 흰 배경 2.15). 반드시 -soft 배경 + -text 글자 세트로 쓴다.
   · danger는 면을 채우지 않는다 — 브랜드 레드 채움과 뜻이 섞인다. 외곽선만.
   · 금액에 쓰지 않는다. 금액 기본은 먹색, 헤드라인 하나만 primary-strong.
   · purge-safe: 완성 클래스 정적 리터럴(동적 조립 금지).

   ── 한글 라벨 ──
   자간을 벌리지 않는다(tracking 기본). 라틴 대문자 라벨 규격(+.16em uppercase)은
   한글에서 자소를 벌려 단어로 안 읽힌다. → Eyebrow와 같은 판단.

   ⚠️ success(초록) 톤은 두지 않았다 — 이 브랜드는 레드·먹색 2색으로 굴러가고
      앱에 초록이 한 곳도 없다. DS 명세에는 emerald success가 있으나 도입하면
      색이 세 벌이 되므로 보류(클로드디자인에 확인 요청 중). */
const BADGE_TONE = {
  neutral: "bg-elevate text-sub",                              // 종결·기본·데모
  zinc:    "bg-elevate text-muted",                            // (레거시 별칭) 흐린 중립
  primary: "bg-primary-soft text-primary-strong",              // 신규·선택됨·핀·활성
  ot:      "bg-ot-soft text-ot-text",                          // OT 흐름
  pt:      "bg-pt-soft text-pt-text",                          // PT 흐름
  sky:     "bg-pt-soft text-pt-text",                          // (레거시 별칭) 재등록 = PT 흐름
  amber:   "bg-ot-soft text-ot-text",                          // (레거시 별칭) 스테일 주의 = OT 톤
  admin:   "bg-admin-soft text-admin-text",                    // 원장 전용
  fuchsia: "bg-admin-soft text-admin-text",                    // (레거시 별칭) 필수확인
  danger:  "text-danger-text ring-1 ring-inset ring-danger/50",// 환불·손실 — 채움 없음
  rose:    "text-danger-text ring-1 ring-inset ring-danger/50",// (레거시 별칭)
};

export default function Badge({ tone = "primary", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-1 text-[11.5px] font-bold leading-none ${
        BADGE_TONE[tone] || BADGE_TONE.primary
      } ${className}`}
    >
      {children}
    </span>
  );
}

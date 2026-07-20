/* 섹션 상단 라벨(아이콘 + 소제목). 트레이너 화면 공용 UI 조각 — 55곳에서 쓰인다.

   ⚠️ 한글 라벨 자간 예외(브랜드 가이드라인 §04 · DS Badge 명세):
   원래 `uppercase tracking-[0.2em]`이었다. 이건 라틴 라벨(TODAY·OT) 규격이라
   한글에 적용하면 두 가지가 깨진다 —
     ① uppercase는 한글에 아무 효과가 없다(규칙만 남고 동작 안 함)
     ② 0.2em은 자소를 벌려 "내 프로필"이 "내  프 로 필"로 읽힌다
   Pretendard로 바꾸면서 이 벌어짐이 더 두드러져 정리한다.

   한글이 섞이면 자간 0.02em·대문자 변환 없음, 순수 라틴이면 기존 라틴 규격 유지.
   판별은 렌더 시 정규식 1회 — 라벨은 짧은 정적 문자열이라 비용이 없다. */
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

export default function Eyebrow({ icon: Icon, children }) {
  const hasHangul = HANGUL.test(String(children ?? ""));
  return (
    <div className="mb-4 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-primary-strong" />}
      <span
        className={
          hasHangul
            ? "text-xs font-semibold tracking-label-ko text-sub"
            : "text-xs font-semibold uppercase tracking-[0.2em] text-sub"
        }
      >
        {children}
      </span>
    </div>
  );
}

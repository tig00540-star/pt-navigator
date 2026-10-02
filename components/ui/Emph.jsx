/* =========================================================================
   Emph — AI 대사 속 '꼭 말할 핵심 구절'을 포인트 색으로(2026-10-02 대표 요청).
   AI(ot-brief 리포트)가 대사마다 핵심 한 구절을 **두 별표**로 감싸 보낸다 → 여기서 빨간 굵은 글씨로.
   짝이 안 맞는 별표는 지운다. 옛 리포트(표시 없음)는 그냥 글자 그대로 보인다.
   대사가 아닌 칸(이유·설명)엔 plainText로 표시만 지워서 쓴다(여기저기 칠하면 아무것도 안 보인다).
   ========================================================================= */

export function plainText(s) {
  return typeof s === "string" ? s.replace(/\*\*/g, "") : s;
}

export default function Emph({ children }) {
  if (typeof children !== "string") return children ?? null;
  const parts = children.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-primary-strong">{p}</strong>
        ) : (
          p.replace(/\*\*/g, "")
        ),
      )}
    </>
  );
}

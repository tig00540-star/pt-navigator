/* =========================================================================
   Emph — AI 대사 속 '꼭 말할 핵심 구절'을 포인트 색으로(2026-10-02 대표 요청).
   AI(ot-brief 리포트)가 대사마다 핵심 한 구절을 **두 별표**로 감싸 보낸다 → 여기서 빨간 굵은 글씨로.
   짝이 안 맞는 별표는 지운다. 옛 리포트(표시 없음)는 그냥 글자 그대로 보인다.
   대사가 아닌 칸(이유·설명)엔 plainText로 표시만 지워서 쓴다(여기저기 칠하면 아무것도 안 보인다).
   ========================================================================= */

// AI가 문장 자리에 객체 · 배열을 보내도 화면이 깨지지 않게 글자로 바꾼다(2026-10-06 · "Objects are not valid as a React child").
function asText(v) {
  if (v == null || typeof v === "string" || typeof v === "number") return v;
  if (Array.isArray(v)) {
    if (v.some((x) => x && typeof x === "object" && "$$typeof" in x)) return v; // JSX 자식 묶음은 그대로
    return v.map(asText).filter((x) => x != null && x !== "").join(" ");
  }
  if (typeof v === "object" && !("$$typeof" in v)) return Object.values(v).map(asText).filter((x) => x != null && x !== "").join(" ");
  return v;
}

export function plainText(s) {
  const t = asText(s);
  return typeof t === "string" ? t.replace(/\*\*/g, "") : t;
}

// tone="quiet" — 빨강 대신 굵게만(강조가 많은 화면에서 빨강은 꼭 필요한 곳에만 · 2026-10-02).
export default function Emph({ children, tone = "primary" }) {
  children = asText(children);
  if (typeof children !== "string") return children ?? null;
  const parts = children.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className={tone === "quiet" ? "font-semibold text-ink" : "font-semibold text-primary-strong"}>{p}</strong>
        ) : (
          p.replace(/\*\*/g, "")
        ),
      )}
    </>
  );
}

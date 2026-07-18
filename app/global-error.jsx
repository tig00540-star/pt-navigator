"use client";
export default function GlobalError({ error, reset }) {
  return (
    <html lang="ko">
      <body style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>문제가 발생했어요</p>
        <p style={{ fontSize: 14, color: "#475569" }}>새로고침해 주세요.</p>
        <button onClick={() => reset()} style={{ borderRadius: 8, background: "#dc2626", color: "#fff", padding: "8px 16px", fontWeight: 600, border: "none" }}>다시 시도</button>
      </body>
    </html>
  );
}

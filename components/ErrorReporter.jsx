"use client";

/* 화면 오류 모으기(2026-10-08 · 앱 운영) — 잡히지 않은 오류 · 처리 안 된 Promise 실패를 서버로 보낸다(lib/reportError).
   app/layout.js에 한 번 둔다. 화면에는 아무것도 그리지 않는다. */
import { useEffect } from "react";
import { reportError } from "@/lib/reportError";

export default function ErrorReporter() {
  useEffect(() => {
    const onErr = (e) => reportError(e?.error?.message || e?.message || "");
    const onRej = (e) => reportError(e?.reason?.message || (typeof e?.reason === "string" ? e.reason : ""));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}

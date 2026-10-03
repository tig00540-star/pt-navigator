"use client";

/* =========================================================================
   InstallHint — 폰에서 "홈 화면에 추가"를 한 번만 안내한다.

   ── 왜 ──
   지금도 홈 화면에 추가하면 주소창 없이 아이콘으로 열린다(앱처럼). 그런데 아이폰 사파리는
   설치 버튼을 띄워주지 않아서, 안내가 없으면 아무도 모른다.

   ── 규율 ──
   · 이미 설치해서 standalone으로 열렸으면 안 띄운다.
   · 안드로이드는 beforeinstallprompt를 잡아 버튼 한 번으로 설치, 아이폰은 방법만 알려준다.
   · 닫으면 다시 안 띄운다(localStorage). 저장이 막힌 브라우저도 있으니 read/write 전부 try/catch —
     실패하면 "안 닫힌 것"으로 보고 그냥 이번 세션에만 숨긴다.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Share, X, Download } from "lucide-react";

const KEY = "ot_install_hint_dismissed";

export default function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    let alive = true;
    // setState는 async 안에서만(react-hooks/set-state-in-effect 회피 · 앱 전반 동일 패턴).
    (async () => {
      let dismissed = false;
      try { dismissed = localStorage.getItem(KEY) === "1"; } catch { dismissed = false; }
      if (dismissed) return;

      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
      if (standalone) return; // 이미 앱처럼 열려 있음

      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isMobile = isIos || /android/i.test(navigator.userAgent);
      if (!isMobile || !alive) return; // 데스크톱은 안내 대상 아님

      setIos(isIos);
      setShow(true);
    })();

    // 안드로이드 크롬 — 설치 프롬프트를 잡아뒀다가 버튼으로 띄운다.
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => { alive = false; window.removeEventListener("beforeinstallprompt", onPrompt); };
  }, []);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try { localStorage.setItem(KEY, "1"); } catch { /* 저장 막힘 — 이번 세션만 숨김 */ }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    close();
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 shadow-sm break-keep text-pretty">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
        {ios ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-ink">홈 화면에 추가하면 앱처럼 열려요</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-sub">
          {ios
            ? "주소창 옆 ⋯ → 공유 → 더보기 → 홈 화면에 추가 → 웹 앱으로 열기"
            : "주소창 없이 아이콘으로 바로 열려요."}
        </p>
        {!ios && deferred && (
          <button
            onClick={install}
            className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white transition active:scale-95"
          >
            홈 화면에 추가
          </button>
        )}
      </div>
      <button onClick={close} aria-label="안내 닫기" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:text-ink active:scale-95">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

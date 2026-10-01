"use client";

/* =========================================================================
   InstallAppButton — 공개 페이지(랜딩·설치 안내)의 "앱 설치" 버튼.

   ── 기기별로 할 수 있는 게 다르다 ──
   · 안드로이드 크롬 / PC 크롬·엣지: beforeinstallprompt를 잡아두면 버튼 한 번으로 설치 창이 뜬다.
   · 아이폰 사파리: 애플이 자동 설치를 막아놨다. 어떤 사이트도 못 한다 —
     할 수 있는 건 '공유 → 홈 화면에 추가' 3단계를 그림으로 보여주는 것까지.
   · 이미 설치해서 standalone으로 열렸으면 버튼을 숨긴다(다시 설치할 게 없다).

   설치 가능 여부는 렌더 전에 알 수 없으므로(이벤트가 나중에 온다), 버튼은 항상 보이고
   누르는 순간 기기에 맞는 길로 보낸다 — "눌렀는데 아무 일도 없음"을 만들지 않는다.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Check, MoreHorizontal } from "lucide-react";

export default function InstallAppButton({ className = "", label = "앱 설치하기" }) {
  const [deferred, setDeferred] = useState(null); // 안드로이드·PC 설치 프롬프트
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState(false); // 아이폰 안내 시트

  useEffect(() => {
    let alive = true;
    (async () => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
      if (standalone && alive) setInstalled(true);
    })();
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <span className={`inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-card px-6 py-3 text-[15px] font-bold text-ink ${className}`}>
        <Check size={18} strokeWidth={2.4} /> 설치되어 있어요
      </span>
    );
  }

  const onClick = async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      setDeferred(null);
      return;
    }
    setGuide(true); // 아이폰이거나 프롬프트를 못 받은 브라우저 — 방법을 보여준다
  };

  return (
    <>
      <button type="button" onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-[10px] bg-primary px-7 py-[15px] text-[16px] font-bold tracking-[-0.01em] text-white transition-colors hover:bg-[#c11f1f] active:scale-95 ${className}`}>
        <Download size={18} strokeWidth={2.4} /> {label}
      </button>

      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </>
  );
}

/* 아이폰·기타 브라우저용 안내 — 포털 없이 고정 오버레이(공개 페이지엔 앱 Modal을 안 쓴다). */
function InstallGuide({ onClose }) {
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const steps = ios
    ? [
        { icon: MoreHorizontal, t: "주소창 옆 ⋯ 를 누르고 ‘공유’를 고르세요", d: "사파리 주소창 오른쪽에 있는 점 세 개입니다." },
        { icon: Share, t: "‘더보기’를 누르세요", d: "공유 목록 아래쪽에 있습니다." },
        { icon: Plus, t: "‘홈 화면에 추가’를 고르세요", d: "목록에서 찾아 누릅니다." },
        { icon: Check, t: "‘웹 앱으로 열기’를 고르고 ‘추가’를 누르세요", d: "홈 화면에 아이콘이 생깁니다." },
      ]
    : [
        { icon: Share, t: "브라우저 메뉴를 여세요", d: "크롬은 우측 상단 ⋮, 엣지는 ⋯ 입니다." },
        { icon: Plus, t: "‘앱 설치’ 또는 ‘홈 화면에 추가’를 고르세요", d: "브라우저마다 이름이 조금 다릅니다." },
        { icon: Check, t: "설치를 확인해 주세요", d: "주소창 없이 앱처럼 열립니다." },
      ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 px-0 sm:items-center sm:px-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="홈 화면에 추가하는 방법"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-t-[20px] bg-card p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-pop sm:rounded-[20px] sm:pb-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink">홈 화면에 추가하기</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {ios
                ? "아래 순서대로 하면 홈 화면에 아이콘이 생겨요."
                : "아래 방법으로 홈 화면에 추가하세요."}
            </p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="shrink-0 rounded-lg p-1 text-muted transition hover:text-ink active:scale-95">
            <X size={18} />
          </button>
        </div>

        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li key={s.t} className="flex items-start gap-3 rounded-2xl border border-line bg-elevate px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card text-primary-strong">
                <s.icon size={16} strokeWidth={2.3} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-ink">{i + 1}. {s.t}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>

        <button onClick={onClose} className="mt-5 w-full rounded-[10px] bg-primary py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99]">
          알겠어요
        </button>
      </div>
    </div>
  );
}

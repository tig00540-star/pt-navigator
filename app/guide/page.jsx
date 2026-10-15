"use client";

/* =========================================================================
   사용 가이드(/guide · 2026-10-15) — 트레이너용 가이드북을 홈페이지에서.
   - 공개 주소(AuthGate 우회 · 쓰레드 DM · 카톡으로 보내는 링크). 앞 PUBLIC_SECTIONS개 장은 누구나 보고,
     나머지는 가입(로그인)한 사람만 본다. 결제 여부와 상관없이 로그인만 돼 있으면 전부 보인다.
   - 로그인 확인은 이 화면 안에서만(세션 읽기). 확인 전에는 공개 장만 그려 깜빡임 없이.
   - 본문은 content.js 한 곳.
   ========================================================================= */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import CompanyInfo from "@/components/CompanyInfo";
import { Sym, Wordmark, COL, FOCUS, BTN_PRIMARY, BTN_OUTLINE } from "@/app/lp/parts";
import { LEAD, LEAD_NOTE, SECTIONS } from "./content";

const PUBLIC_SECTIONS = 2;
const NEXT = encodeURIComponent("/guide");

// **굵게**만 읽는 아주 작은 글 변환
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**")
    ? <b key={i} className="font-bold text-ink">{p.slice(2, -2)}</b>
    : <span key={i}>{p}</span>));
}

function Item({ it }) {
  if (typeof it === "string") return <li className="pl-1"><Rich text={it} /></li>;
  return (
    <li className="pl-1">
      <Rich text={it.c} />
      {it.sub && <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-muted">{it.sub.map((s) => <li key={s}><Rich text={s} /></li>)}</ul>}
    </li>
  );
}

function Block({ b }) {
  switch (b.t) {
    case "p":
      return <p className="m-0 text-[16px] leading-[1.75] text-sub break-keep"><Rich text={b.c} /></p>;
    case "h":
      return (
        <h3 className="m-0 mt-3 flex flex-wrap items-center gap-2 text-[18px] font-extrabold tracking-[-0.02em] text-ink">
          {b.c}
          {b.hot && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] font-bold text-primary-strong">🔥 인기</span>}
        </h3>
      );
    case "ol":
    case "ul": {
      const Tag = b.t;
      return (
        <Tag className={`m-0 space-y-2 pl-6 text-[16px] leading-[1.7] text-sub break-keep ${b.t === "ol" ? "list-decimal" : "list-disc"} marker:font-bold marker:text-muted`}>
          {b.items.map((it, i) => <Item key={i} it={it} />)}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[520px] border-collapse text-left text-[15px] leading-[1.55]">
            <thead><tr className="bg-elevate">{b.head.map((h) => <th key={h} className="px-4 py-2.5 font-bold text-ink">{h}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-t border-line align-top">
                  {r.map((c, j) => <td key={j} className={`px-4 py-2.5 break-keep ${j === 0 ? "font-semibold text-ink" : "text-sub"}`}><Rich text={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return <pre className="m-0 overflow-x-auto rounded-xl border border-line bg-elevate px-4 py-3 font-mono text-[14px] leading-[1.7] text-ink">{b.c}</pre>;
    default:
      return null;
  }
}

function Section({ s }) {
  return (
    <section id={s.id} className="scroll-mt-20 border-t border-line pt-9">
      <h2 className="m-0 text-[clamp(22px,4.4vw,28px)] font-black leading-[1.3] tracking-[-0.03em] text-ink">{s.title}</h2>
      <div className="mt-4 flex flex-col gap-4">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
    </section>
  );
}

export default function GuidePage() {
  // "check" = 확인 중(공개 장만) · "in" = 로그인(전부) · "out" = 로그아웃(공개 장 + 가입 안내)
  const [auth, setAuth] = useState(supabase ? "check" : "in");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setAuth(data?.session ? "in" : "out"); })
      .catch(() => { if (alive) setAuth("out"); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setAuth(s ? "in" : "out"); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const open = auth === "in";
  const shown = open ? SECTIONS : SECTIONS.slice(0, PUBLIC_SECTIONS);
  const locked = open ? [] : SECTIONS.slice(PUBLIC_SECTIONS);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-50 border-b border-line bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-3 px-4 py-1 sm:px-8 lg:h-[64px]">
          <Link href="/lp" className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-md no-underline ${FOCUS}`} aria-label="오직 트레이너 소개로">
            <Sym size={26} />
            <Wordmark />
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {open ? (
              <Link href="/" className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-ink px-4 text-[15px] font-bold text-white no-underline hover:bg-ink/85 ${FOCUS}`}>앱으로</Link>
            ) : (
              <>
                <Link href={`/login?next=${NEXT}`} className={`inline-flex min-h-[44px] items-center rounded-lg px-2.5 text-[15px] font-semibold text-sub no-underline hover:text-ink ${FOCUS}`}>로그인</Link>
                <Link href={`/signup?next=${NEXT}`} className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-ink px-4 text-[15px] font-bold text-white no-underline hover:bg-ink/85 ${FOCUS}`}>가입하기</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={`${COL} pb-20 pt-10`}>
        <p className="m-0 text-[14px] font-bold text-primary-strong">사용 가이드</p>
        <h1 className="m-0 mt-2 text-[clamp(28px,6vw,40px)] font-black leading-[1.22] tracking-[-0.04em]">오직 트레이너 사용 가이드북</h1>
        <p className="m-0 mt-4 text-[16px] leading-[1.75] text-sub break-keep">{LEAD}</p>
        <p className="m-0 mt-2 text-[14px] leading-[1.7] text-muted break-keep">{LEAD_NOTE}</p>

        <nav aria-label="목차" className="mt-7 rounded-2xl border border-line bg-card p-5 shadow-sm">
          <p className="m-0 text-[14px] font-bold text-ink">목차</p>
          <ol className="m-0 mt-3 grid list-none gap-1 p-0 sm:grid-cols-2">
            {SECTIONS.map((s, i) => {
              const free = open || i < PUBLIC_SECTIONS;
              return (
                <li key={s.id}>
                  <a href={free ? `#${s.id}` : "#join"} className={`flex min-h-[40px] items-center gap-2 rounded-lg px-2 text-[15px] no-underline hover:bg-elevate ${free ? "text-ink" : "text-muted"} ${FOCUS}`}>
                    {!free && <Lock size={14} aria-label="가입 후 보기" className="flex-none" />}
                    {s.title}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-10 flex flex-col gap-10">
          {shown.map((s) => <Section key={s.id} s={s} />)}
        </div>

        {locked.length > 0 && (
          <section id="join" className="scroll-mt-20 mt-12 rounded-2xl border border-line bg-card p-6 text-center shadow-sm sm:p-8">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary-strong"><Lock size={20} aria-hidden="true" /></span>
            <h2 className="m-0 mt-4 text-[22px] font-black tracking-[-0.03em]">나머지 {locked.length}장은 가입하면 볼 수 있어요</h2>
            <p className="m-0 mx-auto mt-2 max-w-[460px] text-[15px] leading-[1.7] text-sub break-keep">
              {locked.map((s) => s.title.replace(/^\d+\.\s*/, "")).join(" · ")}
            </p>
            <p className="m-0 mx-auto mt-3 max-w-[460px] text-[14px] leading-[1.7] text-muted break-keep">
              {auth === "check" ? "로그인 상태를 확인하고 있어요…" : "가입은 1분이면 끝나요. 이미 가입하셨다면 로그인만 해 주세요."}
            </p>
            {auth !== "check" && (
              <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
                <Link href={`/signup?next=${NEXT}`} className={BTN_PRIMARY}>가입하고 전체 보기</Link>
                <Link href={`/login?next=${NEXT}`} className={BTN_OUTLINE}>로그인</Link>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-line bg-card">
        <div className={`${COL} flex flex-col gap-4 pb-12 pt-10`}>
          <div className="flex items-center gap-2"><Sym size={24} /><Wordmark size="text-[17px]" /></div>
          <p data-nosnippet="" className="m-0 text-[14px] leading-[1.6] text-sub">
            오직 트레이너는 운동 지도·세일즈·회원관리 도구입니다. 의료기관이 아니며 치료·진단을 제공하지 않습니다.
          </p>
          <div data-nosnippet="" className="border-t border-line pt-5"><CompanyInfo /></div>
        </div>
      </footer>
    </div>
  );
}

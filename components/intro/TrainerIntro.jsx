"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 링크라 next/image 최적화 대상이 아니다(사례 카드와 같음). */

/* 트레이너 '내 소개'(2026-10-11) — OT 신청 QR 페이지 맨 위 · 세일즈북 2번째 장 · 설정 미리 보기가 같이 쓴다.
   intro = { name, credentials, intro, tags[], photo(url), cases[{id,kind,label,note,data}], urls{path:url} } (lib/trainerIntro · useTrainerIntro).
   사례 숫자 · 사진은 사례 보관함 스냅샷 그대로(CaseCard). 회원 이름은 없다(익명 라벨). */
import CaseCard from "@/components/salesbook/CaseCard";

// 표시 이름에 이미 '트레이너'를 적어 둔 사람도 있다(세일즈북 표지와 같은 규칙).
export const introTitle = (name) => (!name ? "트레이너" : /트레이너$/.test(name.trim()) ? name.trim() : `${name.trim()} 트레이너`);

export function IntroHeader({ intro, big = false }) {
  const initial = (intro?.name || "트").trim().slice(0, 1);
  return (
    <div className="flex items-center gap-4">
      {intro?.photo
        ? <img src={intro.photo} alt={introTitle(intro.name)} className={`${big ? "h-20 w-20" : "h-16 w-16"} shrink-0 rounded-full object-cover ring-2 ring-primary/20`} />
        : <div aria-hidden="true" className={`${big ? "h-20 w-20 text-[28px]" : "h-16 w-16 text-[24px]"} flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-black text-primary-strong`}>{initial}</div>}
      <div className="min-w-0">
        <p className={`m-0 font-black tracking-[-0.03em] text-ink ${big ? "text-[24px]" : "text-[20px]"}`}>{introTitle(intro?.name)}</p>
        {intro?.credentials && <p className="m-0 mt-0.5 text-[13px] leading-snug text-sub">{intro.credentials}</p>}
      </div>
    </div>
  );
}

export function IntroTags({ tags = [] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => <span key={t} className="rounded-full border border-primary/25 bg-primary-soft px-3 py-1 text-[13px] font-semibold text-primary-strong">{t}</span>)}
    </div>
  );
}

export function IntroCases({ cases = [], urls = {}, cols = 2 }) {
  if (!cases.length) return null;
  return (
    <div className={`grid gap-3 ${cols === 2 && cases.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
      {cases.map((c) => <CaseCard key={c.id} item={c} urls={urls} />)}
    </div>
  );
}

/** QR 페이지용 한 덩어리(설정 미리 보기도 같은 모양) */
export default function TrainerIntro({ intro, onApply }) {
  if (!intro) return null;
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <IntroHeader intro={intro} big />
      {intro.intro && <p className="m-0 mt-4 break-keep text-pretty text-[16px] font-semibold leading-relaxed text-ink">{intro.intro}</p>}
      {intro.tags?.length > 0 && <div className="mt-3"><IntroTags tags={intro.tags} /></div>}
      {intro.cases?.length > 0 && (
        <div className="mt-5">
          <p className="m-0 mb-2 text-[15px] font-bold text-ink">이런 변화를 만들었어요</p>
          <IntroCases cases={intro.cases} urls={intro.urls} />
          <p className="m-0 mt-2 text-[12px] text-muted">실제 기록 그대로예요. 이름 대신 나이대 · 기간으로 보여 드려요.</p>
        </div>
      )}
      {onApply && (
        <button type="button" onClick={onApply}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary px-4 text-[16px] font-bold text-white">
          OT 신청하기
        </button>
      )}
    </section>
  );
}

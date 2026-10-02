/* 섹션 제목(2026-10-02 · OT 회원 화면 기준) — 아이콘 + 15px 굵은 제목.
   예전 Eyebrow(12px 회색 작은 라벨)는 본문보다 작아 '제목'으로 안 읽혔다. 화면 통일 작업에서 Eyebrow 자리를 이걸로 바꿔 간다
   (PT 회원 화면부터 · 다른 탭은 이어서). aside = 오른쪽 작은 보조 글(개수 등). */
export default function SectionTitle({ icon: Icon, children, aside = null, className = "" }) {
  return (
    <h2 className={`mb-3 flex items-center justify-between gap-2 text-[15px] font-bold tracking-[-0.02em] text-ink ${className}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />}
        <span className="min-w-0">{children}</span>
      </span>
      {aside && <span className="shrink-0 text-[12px] font-normal text-muted">{aside}</span>}
    </h2>
  );
}

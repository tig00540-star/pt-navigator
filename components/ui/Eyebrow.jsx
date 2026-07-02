// 섹션 상단 라벨(아이콘 + 대문자 소제목). 트레이너 화면 공용 UI 조각.
export default function Eyebrow({ icon: Icon, children }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-zinc-500" />
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {children}
      </span>
    </div>
  );
}

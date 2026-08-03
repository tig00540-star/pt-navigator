// 법적 문서(약관·방침) 공용 타이포 프리미티브. Tailwind typography 미설치라 요소마다 클래스 지정.
export function Title({ children }) {
  return <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-[-0.03em] text-ink">{children}</h1>;
}
export function Updated({ date }) {
  return <p className="mt-2 text-[13px] text-muted">시행일 {date}</p>;
}
export function H({ children }) {
  return <h2 className="mt-9 text-[16.5px] font-bold tracking-[-0.02em] text-ink">{children}</h2>;
}
export function P({ children }) {
  return <p className="mt-2.5 text-[14px] leading-[1.8] tracking-[-0.005em] text-sub">{children}</p>;
}
export function UL({ items }) {
  return (
    <ul className="mt-2.5 flex flex-col gap-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2.5 text-[14px] leading-[1.75] tracking-[-0.005em] text-sub">
          <span className="mt-[10px] h-1 w-1 flex-none rounded-full bg-muted" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

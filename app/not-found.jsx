import Link from "next/link";

// 없는 주소(2026-10-12 점검: 기본 영어 404 화면이 보이던 것)
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <p className="text-lg font-bold text-ink">없는 화면이에요</p>
      <p className="text-sm text-sub">주소가 바뀌었거나 지워진 화면이에요. 처음 화면에서 다시 찾아 주세요.</p>
      <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">처음으로</Link>
    </div>
  );
}

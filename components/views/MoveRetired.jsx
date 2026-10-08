"use client";

/* 옛 '같은 아이디로 센터 합류 · 개인 독립' 주소(/join-center · /leave-center) 안내(2026-10-08 · 분리 방식).
   아이디는 처음 만든 곳 것이라 아이디를 옮기지 않는다. 다른 아이디의 내 자료는 설정에서 복사해 온다. */
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function MoveRetired() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-[520px]">
        <Card padding="lg">
          <h1 className="m-0 text-[20px] font-black leading-snug tracking-[-0.03em] text-ink">아이디는 옮기지 않아요</h1>
          <ul className="m-0 mt-3 list-none space-y-2 p-0 text-[14.5px] leading-relaxed text-sub">
            <li>· 센터에서 쓰는 아이디는 센터 것이고, 개인으로 쓰는 아이디는 개인 것이에요.</li>
            <li>· 센터에 들어가면 대표가 센터용 아이디를 만들어 줘요. 개인 아이디는 그대로 남아요.</li>
            <li>· 다른 아이디의 가격표 · 라이브러리 · 포트폴리오 사례는 <b className="text-ink">설정 › 내 정보 › 다른 아이디에서 내 자료 가져오기</b>로 복사해 와요.</li>
          </ul>
          <Button as="a" href="/" variant="primary" size="md" fullWidth className="mt-5">홈으로</Button>
        </Card>
      </div>
    </main>
  );
}

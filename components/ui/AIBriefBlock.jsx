/* =========================================================================
   AIBriefBlock — AI 사전무장/브리핑 블록의 단일 출처.
   T-03(1차 사전무장) · T-05(2차 등록당위성) · T-08(재등록)에서 재사용.

   존재 이유: PRD 리스크 1순위 = "AI 응답 45초~1분인데 스트리밍이 없어 빈 화면".
   "수업 입장 직전 3분"이 제품 콘셉트인데 그중 1분을 빈 화면으로 쓰는 건 콘셉트 붕괴다.
   그래서 loading 상태에서 **진행 표시 + waitingHint를 구조적으로 강제**한다.
   loading에 waitingHint 없이 쓰는 건 이 컴포넌트의 목적을 무력화하는 것이다.

   규격 출처: 「오직 트레이너 Design System」 components/feedback/AIBriefBlock.prompt.md
   구현은 앱의 Tailwind로 — DS의 인라인 스타일 레퍼런스는 이식하지 않는다(반응형·상태 불가).

   purge-safe: 모든 색 클래스는 정적 문자열 리터럴(동적 조립 금지 · Button/Badge 컨벤션).
   ========================================================================= */
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import Button from "./Button";
import Badge from "./Badge";

/* 상태별 바깥 테두리. stale만 amber로 주의를 준다.
   ⚠️ 좌측 3px 레드는 상태와 무관하게 항상 유지된다 — DS 레퍼런스 구현은 loading에서
   이 선을 잃는데(측정 확인), 하필 가장 오래 보이는 45초 동안 브랜드 강조가 사라지는 셈이라
   명세("고정, 상태 무관")를 따른다. */
const RING = {
  idle:    "border-line",
  loading: "border-line",
  ready:   "border-line",
  stale:   "border-amber-500/50",
  demo:    "border-line",
};

const SHOW_REGEN = ["ready", "stale", "demo"];

export default function AIBriefBlock({
  status = "ready",
  title = "AI 브리핑",
  waitingHint,
  idleDescription,
  meta,          // 생성 시각·저장 여부 같은 보조 라인(노드)
  notice,        // 실패·안내 배너(노드)
  onGenerate,
  onRegenerate,
  generateLabel = "브리핑 생성",
  className = "",
  children,
  ...rest
}) {
  const loading = status === "loading";
  const showRegen = SHOW_REGEN.includes(status) && typeof onRegenerate === "function";
  const showBody = SHOW_REGEN.includes(status);

  return (
    <section
      {...rest}
      className={`relative overflow-hidden rounded-2xl border bg-card shadow-sm p-5 ${RING[status] || RING.ready} ${className}`}
    >
      {/* 좌측 브랜드 강조선 — before로 그린다.
         border-l-[3px]와 border를 같이 쓰면 둘 다 특이도 (0,1,0)이라
         Tailwind 출력 순서에 승패가 달리는 취약한 구조가 된다. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />

      {/* 헤더 — 뱃지는 같은 줄에 두지 않는다.
         폰 폭(430px)에서 아이콘+긴 한글 제목+긴 뱃지+버튼을 한 줄에 넣으면
         제목이 2줄로 접히고 버튼이 "재생/성"으로 쪼개진다(목업에서 실측). */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2.5} />
          <h3 className="truncate text-[15px] font-bold tracking-[-0.03em] text-ink">{title}</h3>
        </div>

        {/* 재생성 — 좁은 폭에서는 아이콘만(인라인 스타일로는 못 하던 반응형 처리).
           글자를 숨겨도 aria-label이 남아 접근성 이름은 항상 "재생성"이다. */}
        {showRegen && (
          <Button variant="ghost" size="sm" onClick={onRegenerate} aria-label="재생성" className="shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">재생성</span>
          </Button>
        )}
      </div>

      {/* 상태 뱃지 — 제목 아래 별도 줄 */}
      {(status === "stale" || status === "demo") && (
        <div className="mt-2">
          {status === "stale" && <Badge tone="amber">기록 변경됨 · 재생성 권장</Badge>}
          {status === "demo" && <Badge tone="zinc">데모</Badge>}
        </div>
      )}

      {meta && !loading && (
        <div className="mt-2 text-[10px] leading-relaxed text-muted">{meta}</div>
      )}

      {notice && !loading && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          {notice}
        </div>
      )}

      {/* idle — 무엇을 만들지 설명하고 생성 버튼 */}
      {status === "idle" && (
        <div className="mt-3.5 flex flex-col items-start gap-3">
          {idleDescription && (
            <p className="text-[13px] leading-relaxed text-sub">{idleDescription}</p>
          )}
          {typeof onGenerate === "function" && (
            <Button variant="primary" size="md" onClick={onGenerate}>
              <Sparkles className="h-4 w-4" strokeWidth={2.5} /> {generateLabel}
            </Button>
          )}
        </div>
      )}

      {/* loading — 이 컴포넌트의 존재 이유. 절대 빈 화면이 되면 안 된다. */}
      {loading && (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2.5">
            <Loader2 className="h-[18px] w-[18px] animate-spin text-primary motion-reduce:animate-none" />
            <span className="text-sm font-semibold text-ink">브리핑 만드는 중…</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-elevate">
            <div className="h-full w-2/5 rounded-full bg-primary [animation:ot-indeterminate_1.4s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:[animation:none]" />
          </div>

          {waitingHint && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{waitingHint}</p>
          )}
        </div>
      )}

      {showBody && children && <div className="mt-3.5 space-y-3.5">{children}</div>}
    </section>
  );
}

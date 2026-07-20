/* =========================================================================
   폼 필드 4종 — Input · Textarea · Select · Checkbox.
   규격 출처: DS components/forms/Input.prompt.md(필드 공통 규격의 정본).

   ── 왜 만드는가 ──
   `inputCls`가 21개 파일에 각각 정의돼 있고 7가지로 갈라져 있었다:
     · 대다수: bg-elevate px-3 py-2 text-sm focus:border-primary disabled:opacity-50
     · admin 2곳: focus:border-fuchsia-500/50  (원장 accent)
     · 회원앱: py-2.5 text-base                (iOS 확대 방지로 추정)
     · SetsEditor: bg-card px-2 py-1.5         (조밀한 표 입력)
     · PayrollConfirm: w-28 text-right font-mono (금액 입력)
     · signup: transition 있음 / 일부: disabled 규칙 없음
   복사본이라 한 곳을 고쳐도 나머지가 안 따라온다. 여기로 수렴시킨다.

   ── 링은 ring, border 아님 ──
   focus에서 border 두께를 바꾸면 1px씩 레이아웃이 밀린다. ring-inset은 안 밀린다.
   기존 앱은 focus:border-primary(두께 유지·색만 변경)라 안 밀렸지만,
   DS 규격은 1px→2px이므로 ring이 필수다.

   ── iOS 확대 ──
   Safari는 16px 미만 입력에 포커스하면 화면을 확대하고 되돌리지 않는다.
   globals.css가 이미 폰 폭에서 input/select/textarea를 16px로 올려 막고 있으므로
   여기서는 15px(DS 규격)을 쓰고 그 전역 규칙에 맡긴다. 이중으로 올리지 않는다.

   purge-safe: 완성 클래스 정적 리터럴(동적 조립 금지).
   ========================================================================= */
import { ChevronDown } from "lucide-react";

/* 크기 — 앱의 기존 변종을 흡수하는 축.
   md = DS 기본 규격 · sm = 조밀한 표 입력(SetsEditor·PayrollConfirm 자리) */
const SIZE = {
  md: "px-3.5 py-[11px] text-[15px]",
  sm: "px-2.5 py-1.5 text-sm",
};

/* 링 — 평상시 1px, focus 2px. invalid는 rose. */
const RING = "ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-primary";
const RING_ERR = "ring-1 ring-inset ring-rose-500 focus:ring-2 focus:ring-rose-500";
/* 원장 화면 accent — 앱 고유 개념(DS Button에 accent 축이 없어 이식 금지 대상).
   폼도 같은 규율을 따른다: admin 화면은 fuchsia 포커스를 유지한다. */
const RING_OWNER = "ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-fuchsia-500";

const BASE =
  "w-full min-w-0 rounded-lg bg-card text-ink outline-none placeholder:text-muted " +
  "transition-[box-shadow] duration-[180ms] ease-[cubic-bezier(.22,.9,.28,1)] " +
  "disabled:bg-elevate disabled:opacity-60 disabled:cursor-not-allowed";

function ringFor(error, accent) {
  if (error) return RING_ERR;
  return accent === "owner" ? RING_OWNER : RING;
}

/* =========================================================================
   inputCls — 컴포넌트로 아직 안 옮긴 raw <input>/<select>/<textarea>용 공유 클래스.

   ⚠️ 이건 과도기 장치다. 목표는 위의 Input/Textarea/Select 컴포넌트지만,
   앱의 라벨 마크업이 8가지로 갈라져 있어(label className만 8종) JSX 재구조화는
   위험 대비 이득이 낮다. 그래서 '드리프트'부터 없앤다 —
   21개 파일이 각자 정의하던 문자열을 여기 한 곳으로 모은다.

   이렇게 하면 최소한 "한 곳을 고치면 전부 따라온다"가 성립한다.
   컴포넌트 전환은 라벨·에러가 실제로 필요한 화면부터 점진적으로.
   ========================================================================= */
export const inputCls = `${BASE} ${SIZE.md} ${RING}`;
/* admin 화면 — 원장 accent(fuchsia). Button의 accent="owner"와 같은 규율. */
export const inputClsOwner = `${BASE} ${SIZE.md} ${RING_OWNER}`;
/* 조밀한 표 입력(SetsEditor·PayrollConfirm 자리) */
export const inputClsSm = `${BASE} ${SIZE.sm} ${RING}`;

/* 라벨 + hint/error 껍데기 — 4종이 공유한다. */
function Shell({ label, htmlFor, hint, error, children, className = "" }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-[12.5px] font-semibold tracking-[-0.01em] text-sub">
          {label}
        </label>
      )}
      {children}
      {(hint || error) && (
        <span className={`text-[12px] leading-relaxed ${error ? "text-rose-600" : "text-muted"}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

export function Input({
  label, hint, error, suffix, id, size = "md", accent = "trainer",
  align, mono = false, className = "", ...rest
}) {
  return (
    <Shell label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <div className="relative flex items-center">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          className={`${BASE} ${SIZE[size] || SIZE.md} ${ringFor(error, accent)}${
            suffix ? " pr-11" : ""
          }${align === "right" ? " text-right" : ""}${mono ? " font-mono tabular-nums" : ""}`}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 text-[13px] text-muted">{suffix}</span>
        )}
      </div>
    </Shell>
  );
}

export function Textarea({
  label, hint, error, id, rows = 3, accent = "trainer", className = "", ...rest
}) {
  return (
    <Shell label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        /* resize-y — 관찰 기록처럼 길어지는 입력이 많다. 가로 리사이즈는 레이아웃을 깨서 막는다. */
        className={`${BASE} ${SIZE.md} ${ringFor(error, accent)} resize-y leading-[1.6]`}
        {...rest}
      />
    </Shell>
  );
}

export function Select({
  label, hint, error, id, accent = "trainer", className = "", children, ...rest
}) {
  return (
    <Shell label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <div className="relative flex items-center">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          /* appearance-none + 직접 그린 chevron — OS 기본 화살표는 플랫폼마다 달라
             같은 화면이 기기별로 다르게 보인다(한글 폰트와 같은 종류의 문제). */
          className={`${BASE} ${SIZE.md} ${ringFor(error, accent)} appearance-none pr-10`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" />
      </div>
    </Shell>
  );
}

export function Checkbox({ label, hint, id, className = "", ...rest }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5">
        <input
          id={id}
          type="checkbox"
          /* accent-color로 체크 채움을 브랜드 레드로. 직접 그리면 OS 접근성 동작을 잃는다. */
          className="h-4 w-4 shrink-0 cursor-pointer rounded accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          {...rest}
        />
        <span className="text-[14px] text-ink">{label}</span>
      </label>
      {hint && <span className="pl-[26px] text-[12px] leading-relaxed text-muted">{hint}</span>}
    </div>
  );
}

export default Input;

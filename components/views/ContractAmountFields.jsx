"use client";
// 계약 금액 입력 4칸(controlled). 값·검증·저장은 부모. 여기선 렌더+onChange만.
// sessions·price 입력 → 총액 자동(부모가 autoAmount 계산해 넘김). 총액칸은 수정 허용(amountEdited).
const inputCls =
  "w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

export default function ContractAmountFields({
  sessions, price, amountEdited, svc, autoAmount, disabled, onChange,
}) {
  // onChange(key, value) — key: 'sessions'|'price'|'amountEdited'|'svc'
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted">세션수 *</span>
        <input type="number" value={sessions} onChange={(e) => onChange("sessions", e.target.value)} disabled={disabled} placeholder="24" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted">회당단가(원) *</span>
        <input type="number" value={price} onChange={(e) => onChange("price", e.target.value)} disabled={disabled} placeholder="60000" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted">총액(원) · 자동</span>
        <input type="number" value={amountEdited !== "" ? amountEdited : autoAmount ? String(autoAmount) : ""} onChange={(e) => onChange("amountEdited", e.target.value)} disabled={disabled} placeholder="자동 계산" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted">서비스 세션</span>
        <input type="number" value={svc} onChange={(e) => onChange("svc", e.target.value)} disabled={disabled} placeholder="0" className={inputCls} />
      </label>
    </div>
  );
}

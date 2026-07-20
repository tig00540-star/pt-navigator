"use client";
import { useRef } from "react";
import { Input } from "@/components/ui/Field";

// 천단위 콤마 정수 입력. ★ value = '콤마 없는 숫자 문자열'(부모 state 그대로) — 화면에만 콤마.
// 저장·검증(Number()/=== "")은 부모가 기존과 동일. 정수 전용(소수·퍼센트엔 쓰지 말 것 — §5).
// 부모 계약: value=문자열, onValueChange=(raw문자열)=>void. 나머지(className·placeholder·disabled)는 그대로 전달.
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const toRaw = (s) => String(s ?? "").replace(/[^\d]/g, "").replace(/^0+(?=\d)/, ""); // 숫자만 + 선행 0 제거(단, 단독 "0"은 보존)

export default function NumberInput({ value, onValueChange, ...rest }) {
  const ref = useRef(null);
  const display = group(toRaw(value));

  const handle = (e) => {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const digitsBefore = el.value.slice(0, caret).replace(/[^\d]/g, "").length; // 캐럿 앞 '숫자' 개수
    onValueChange(toRaw(el.value));
    // 리렌더 후 캐럿 복원 — 콤마 삽입으로 커서가 튀는 것 방지
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      let pos = 0, seen = 0;
      while (pos < node.value.length && seen < digitsBefore) {
        if (/\d/.test(node.value[pos])) seen++;
        pos++;
      }
      node.setSelectionRange(pos, pos);
    });
  };

  /* 셸은 Field의 Input에 위임한다 — 17곳이 여기를 거치므로 한 번에 규격이 통일된다.
     ref는 React 19에서 일반 prop이라 그대로 내려간다(forwardRef 불필요).
     캐럿 복원 로직은 그 ref에 의존하므로 반드시 실제 <input>까지 닿아야 한다. */
  return (
    <Input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handle}
    />
  );
}

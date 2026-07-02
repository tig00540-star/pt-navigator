import { useState } from "react";

// 짧게 떴다 사라지는 토스트 메시지 상태. 여러 탭(음성일지·관찰 기록)이 공유.
export function useToast(ms = 3500) {
  const [toast, setToast] = useState("");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  };
  return { toast, showToast };
}

// 이미지 압축·리사이즈 — 업로드 전 클라 압축(원본 그대로 올리지 말 것). canvas만 사용(무의존).
// 최장변 maxDim로 축소 · JPEG quality. HEIC은 브라우저가 못 읽으면 실패(에러 처리 → 다른 사진 안내).
export async function compressImage(file, maxDim = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("이미지를 읽을 수 없어요"));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("변환 실패");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

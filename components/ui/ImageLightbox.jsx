"use client";
import { X } from "lucide-react";
// 전체화면 이미지 뷰어 — src 있으면 열림, 아무 데나 탭하면 onClose. 네이티브 다이얼로그 안 씀.
export default function ImageLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <button onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 rounded-lg p-2 text-white/80 hover:text-white">
        <X className="h-6 w-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="사진" className="max-h-full max-w-full object-contain rounded-lg" />
    </div>
  );
}

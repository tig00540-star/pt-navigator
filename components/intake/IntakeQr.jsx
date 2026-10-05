"use client";

/* OT 신청 QR · 링크(2026-10-06) — 트레이너 설정('내 OT 신청 QR') · 대표 화면(센터 QR · 트레이너별 링크) 공용.
   코드는 DB 함수 intake_link_get(본인 · 대표만 · 없으면 만듦)으로 받는다.
   · QR 보기 = 앞에 있는 회원이 폰 카메라로 찍는다(전체 크게).
   · 링크 복사 = 카톡 · 문자로 보낼 때(폰으로 받은 QR 그림은 그 폰으로 찍을 수 없어서 멀리 있는 회원에겐 링크).
   · 이미지 저장 = 포스터 · 전단용 PNG.
   · 새 링크로 바꾸기 = 옛 QR · 링크를 닫는다(잘못 퍼졌을 때). */

import { useEffect, useState } from "react";
import { Copy, Download, QrCode, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";

async function qrDataUrl(text) {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(text, { margin: 2, width: 720, errorCorrectionLevel: "M", color: { dark: "#13151b", light: "#ffffff" } });
}

const btn = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[14px] font-semibold text-ink transition hover:border-line-strong active:scale-[0.99] disabled:opacity-40";

/** trainerId = null이면 센터 QR. label = 저장 파일 · QR 창 제목에 쓰는 이름. compact = 링크 복사 버튼 하나만(대표 화면 트레이너 줄). */
export default function IntakeQr({ trainerId = null, label = "", compact = false, showToast }) {
  const [code, setCode] = useState(null);   // null=불러오는 중 · ""=못 받음
  const [qr, setQr] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { if (alive) setCode(""); return; }
      const { data, error } = await supabase.rpc("intake_link_get", { p_trainer: trainerId, p_rotate: false });
      if (error) console.error("OT 신청 링크 받기 실패", error);
      if (alive) setCode(error ? "" : data || "");
    })();
    return () => { alive = false; };
  }, [trainerId]);

  const url = code ? `${typeof window !== "undefined" ? window.location.origin : "https://onlytrainer.co.kr"}/join/${code}` : "";
  const message = `OT 신청서예요. 원하는 요일 · 시간과 목표를 남겨 주시면 첫 OT를 맞춰 준비할게요.\n👉 ${url}`;

  const showQr = async () => {
    if (!url) return;
    try { setQr(await qrDataUrl(url)); setOpen(true); }
    catch (e) { console.error(e); showToast?.("QR을 만들지 못했어요. 다시 시도해 주세요."); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); showToast?.("링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요."); }
    catch { showToast?.("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요."); }
  };
  const save = async () => {
    try {
      const d = qr || (await qrDataUrl(url));
      const a = document.createElement("a");
      a.href = d; a.download = `OT신청-QR${label ? `-${label}` : ""}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.error(e); showToast?.("이미지를 저장하지 못했어요. 다시 시도해 주세요."); }
  };
  const rotate = async () => {
    if (!window.confirm("새 링크로 바꿀까요? 지금 QR과 링크는 더 이상 열리지 않아요. 붙여 둔 포스터도 새로 뽑아야 해요.")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("intake_link_get", { p_trainer: trainerId, p_rotate: true });
      if (error || !data) { console.error(error); showToast?.("바꾸지 못했어요. 다시 시도해 주세요."); return; }
      setCode(data); setQr(null); showToast?.("새 링크로 바꿨어요");
    } finally { setBusy(false); }
  };

  if (code === null) return <p className="m-0 text-[13px] text-muted">불러오는 중이에요</p>;
  if (!code) return <p className="m-0 text-[13px] text-muted">신청 링크를 받지 못했어요. 다시 열어 주세요.</p>;

  if (compact) {
    return <button type="button" onClick={copy} className={btn}><Copy className="h-4 w-4" aria-hidden="true" /> 링크 복사</button>;
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={showQr} className={btn}><QrCode className="h-4 w-4" aria-hidden="true" /> QR 보기</button>
        <button type="button" onClick={copy} className={btn}><Copy className="h-4 w-4" aria-hidden="true" /> 링크 복사</button>
        <button type="button" onClick={save} className={btn}><Download className="h-4 w-4" aria-hidden="true" /> 이미지</button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[12px] text-muted">{url}</span>
        <button type="button" onClick={rotate} disabled={busy} className="inline-flex min-h-[36px] shrink-0 items-center gap-1 text-[13px] font-semibold text-sub hover:text-ink">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> 새 링크로 바꾸기
        </button>
      </div>
      {open && qr && (
        <Modal onClose={() => setOpen(false)} title="OT 신청 QR" subtitle={label ? `${label} · 폰 카메라로 찍어 주세요` : "폰 카메라로 찍어 주세요"} size="sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="OT 신청서 QR 코드" className="mx-auto block aspect-square w-full max-w-[320px] rounded-xl border border-line" />
          <p className="m-0 mt-3 text-center text-[13px] leading-relaxed text-sub">카메라를 QR에 대면 신청서 링크가 떠요. 누르면 바로 열려요.</p>
        </Modal>
      )}
    </div>
  );
}

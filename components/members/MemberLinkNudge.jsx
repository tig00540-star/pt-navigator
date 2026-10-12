"use client";

/* 운동일지 저장 직후 링크 안내(2026-10-12 · 대표: "수업일지 쓰면서 회원에게 보내 주면 된다").
   회원이 회원 전용 페이지에 한 번도 안 들어왔으면(member_auth_id 없음) 한 줄 + [카톡 문구 복사].
   링크가 아직 없으면 그 자리에서 만든다(issue_member_token · 프리미엄 아니면 서버가 거절). */

import { useState } from "react";
import { Copy, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { copyText } from "@/lib/clipboard";
import Button from "@/components/ui/Button";

const linkFor = (t) => (typeof window !== "undefined" ? window.location.origin : "") + "/m/" + t;
const message = (name, t) =>
  `${name ? `${name} 회원님, ` : ""}오늘 운동일지를 남겼어요. 아래 링크에서 확인 · 서명해 주세요. 휴대폰 번호 뒤 4자리로 들어올 수 있어요.\n${linkFor(t)}`;

export default function MemberLinkNudge({ member, onMemberPatch, onClose }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!member || member.member_auth_id) return null;

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      let token = member.member_token || null;
      if (!token) {
        if (!supabase) { setNote("데모 모드라 링크를 만들지 않아요."); return; }
        const { data, error } = await supabase.rpc("issue_member_token", { p_member_id: member.id });
        if (error || !data) {
          if (error) console.error("회원 링크 발급 실패", error);
          setNote(error?.message === "premium_required"
            ? "회원 전용 페이지는 지금 요금제에서 쓸 수 없어요. 센터 소속이면 대표에게 확인해 주세요."
            : "링크를 만들지 못했어요. 다시 시도해 주세요.");
          return;
        }
        token = data;
        onMemberPatch?.(member.id, { member_token: token });
      }
      const ok = await copyText(message(member.name, token));
      setNote(ok ? "카톡 문구를 복사했어요. 회원님께 보내 주세요." : "복사하지 못했어요. 회원 화면의 '회원 전용 페이지'에서 링크를 복사해 주세요.");
    } catch {
      setNote("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-elevate px-3.5 py-3">
      <div className="flex items-start gap-2">
        <p className="m-0 flex-1 text-[13px] leading-relaxed text-sub">
          회원님이 아직 회원 전용 페이지를 안 열어 봤어요. 링크를 보내면 오늘 운동일지를 바로 확인 · 서명할 수 있어요.
        </p>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-2"><Button variant="ghost" size="sm" onClick={copy} disabled={busy}><Copy className="h-4 w-4" aria-hidden="true" /> {busy ? "만드는 중…" : "카톡 문구 복사"}</Button></div>
      {note && <p className="m-0 mt-1.5 text-[12px] text-muted">{note}</p>}
    </div>
  );
}

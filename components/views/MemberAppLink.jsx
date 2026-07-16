// components/views/MemberAppLink.jsx — 회원앱 링크 발급·복사·PT 종료 (S3). PT 뷰 상단 바.
"use client";

import { useState } from "react";
import { Link2, Copy, Ban, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { copyText } from "@/lib/clipboard";

export default function MemberAppLink({ member, onMemberPatch }) {
  const token = member?.member_token || null;
  const linked = Boolean(member?.member_auth_id); // 회원이 최소 1회 로그인함
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { toast, showToast } = useToast();

  const linkFor = (t) =>
    (typeof window !== "undefined" ? window.location.origin : "") + "/m/" + t;

  // 링크 생성 = issue_member_token() RPC(서버측 plan 확인·발급). B2 층2 게이트 — premium 아니면 서버가 거절.
  const issue = async () => {
    if (busy) return;
    if (!supabase) {
      showToast("데모 모드 — 실제 발급 불가");
      return;
    }
    setBusy(true);
    const { data: newToken, error } = await supabase.rpc("issue_member_token", {
      p_member_id: member.id,
    });
    if (error || !newToken) {
      setBusy(false);
      if (error?.message === "premium_required") {
        showToast("회원앱은 프리미엄 전용이에요 — 업그레이드가 필요해요.");
      } else {
        showToast("발급 실패" + (error ? ": " + error.message : ""));
      }
      return;
    }
    onMemberPatch?.(member.id, { member_token: newToken }); // 로컬 낙관 갱신(배지·버튼 즉시 반영)
    const ok = await copyText(linkFor(newToken));
    showToast(ok ? "링크 생성·복사됨" : "발급됨 (복사 실패 — 링크 복사 다시 눌러줘)");
    setBusy(false);
  };

  // 기존 토큰 복사(발급 없이)
  const copyExisting = async () => {
    if (!token) return;
    const ok = await copyText(linkFor(token));
    showToast(ok ? "링크 복사됨" : "복사 실패 — 길게 눌러 복사");
  };

  // PT 종료 = 서버가 회원 auth 유저 삭제(세션 무효) + member_token/auth_id=null. (완전 차단)
  const endPt = async () => {
    if (busy) return;
    if (!supabase) {
      showToast("데모 모드 — 실제 종료 불가");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/member-revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ memberId: member.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setBusy(false);
        setConfirmEnd(false);
        showToast(json.error || "PT 종료 실패");
        return;
      }
      onMemberPatch?.(member.id, { member_token: null, member_auth_id: null }); // 배지 사라짐·[링크 생성]으로 복귀
      showToast("PT 종료됨 · 회원앱 접근 차단");
    } catch {
      showToast("네트워크 오류 · 다시 시도");
    }
    setBusy(false);
    setConfirmEnd(false);
  };

  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0 text-primary-strong" />
        <span className="text-xs font-semibold text-ink">회원앱 링크</span>
        {token && (
          <Badge tone={linked ? "sky" : "primary"} className="ml-0.5">
            {linked ? "연결됨" : "발급됨"}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {!token ? (
            <Button variant="primary" size="sm" onClick={issue} disabled={busy}>
              <Link2 className="h-3.5 w-3.5" /> {busy ? "생성 중…" : "링크 생성"}
            </Button>
          ) : (
            <>
              <Button variant="solid" size="sm" onClick={copyExisting} disabled={busy}>
                <Copy className="h-3.5 w-3.5" /> 링크 복사
              </Button>
              {confirmEnd ? (
                <Button variant="danger" size="sm" onClick={endPt} disabled={busy}>
                  <Check className="h-3.5 w-3.5" /> {busy ? "종료 중…" : "정말 종료"}
                </Button>
              ) : (
                <Button variant="danger" subtle size="sm" onClick={() => setConfirmEnd(true)} disabled={busy}>
                  <Ban className="h-3.5 w-3.5" /> PT 종료
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {confirmEnd && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          PT를 종료하면 이 회원의 앱 접근이 차단됩니다(로그인 세션 무효 + 링크 폐기). 회원 기록(수업일지·인바디)은 그대로 보존돼요. 다시 열려면 [링크 생성]으로 새 링크를 발급하면 됩니다.
        </p>
      )}
      <Toast message={toast} />
    </div>
  );
}

// components/views/MemberAppLink.jsx — 회원 전용 페이지 링크 발급·복사·끄기 (S3). PT 뷰 · 지난 회원 화면.
//   2026-10-05: 'PT 종료' 버튼 → '회원 페이지 끄기'(PT 종료는 '오늘' 탭 카드가 한다 · 지난 회원은 6개월 동안 읽기 전용).
//   readOnly(지난 회원) = 새 링크는 만들지 않는다(볼 수만 있는 기간이라).
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

export default function MemberAppLink({ member, onMemberPatch, readOnly = false }) {
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
      showToast("데모 모드라 실제로 발급되지 않아요");
      return;
    }
    setBusy(true);
    const { data: newToken, error } = await supabase.rpc("issue_member_token", {
      p_member_id: member.id,
    });
    if (error || !newToken) {
      setBusy(false);
      if (error?.message === "premium_required") {
        showToast("회원 전용 페이지는 프리미엄 플랜에서 쓸 수 있어요. 센터 소속이면 대표에게 플랜 확인을 부탁해 주세요.");
      } else {
        if (error) console.error("회원 링크 발급 실패", error); showToast("발급하지 못했어요. 다시 시도해 주세요.");
      }
      return;
    }
    onMemberPatch?.(member.id, { member_token: newToken }); // 로컬 낙관 갱신(배지·버튼 즉시 반영)
    const ok = await copyText(linkFor(newToken));
    showToast(ok ? "링크를 만들고 복사했어요" : "링크는 만들었어요. 복사가 안 됐으니 '링크 복사'를 다시 눌러 주세요");
    setBusy(false);
  };

  // 기존 토큰 복사(발급 없이)
  const copyExisting = async () => {
    if (!token) return;
    const ok = await copyText(linkFor(token));
    showToast(ok ? "링크를 복사했어요" : "복사하지 못했어요. 링크를 길게 눌러 복사해 주세요");
  };

  // 회원 페이지 끄기 = 서버가 회원 auth 유저 삭제(세션 무효) + member_token/auth_id=null. (완전 차단 · 기록은 그대로)
  const endPt = async () => {
    if (busy) return;
    if (!supabase) {
      showToast("데모 모드라 실제로 꺼지지 않아요");
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
        console.error("회원 페이지 끄기 실패", json.error);
        showToast("회원 페이지를 끄지 못했어요. 다시 시도해 주세요.");
        return;
      }
      onMemberPatch?.(member.id, { member_token: null, member_auth_id: null }); // 배지 사라짐·[링크 생성]으로 복귀
      showToast("회원 페이지를 껐어요. 기록은 그대로 남아 있어요.");
    } catch {
      showToast("네트워크 오류예요. 잠시 후 다시 시도해 주세요.");
    }
    setBusy(false);
    setConfirmEnd(false);
  };

  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0 text-primary-strong" />
        <span className="text-xs font-semibold text-ink">회원 전용 페이지 링크</span>
        {token && (
          <Badge tone={linked ? "sky" : "primary"} className="ml-0.5">
            {linked ? "연결됨" : "발급됨"}
          </Badge>
        )}
        {token && readOnly && <Badge tone="neutral">볼 수만 있음</Badge>}
        <div className="ml-auto flex items-center gap-1.5">
          {!token ? (readOnly ? null :
            <Button variant="primary" size="sm" onClick={issue} disabled={busy}>
              <Link2 className="h-3.5 w-3.5" /> {busy ? "생성 중…" : "링크 생성"}
            </Button>
          ) : (
            <>
              <Button variant="solid" size="sm" onClick={copyExisting} disabled={busy}>
                <Copy className="h-3.5 w-3.5" /> 링크 복사
              </Button>
              {confirmEnd ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(false)} disabled={busy}>취소</Button>
                  <Button variant="danger" size="sm" onClick={endPt} disabled={busy}>
                    <Check className="h-3.5 w-3.5" /> {busy ? "끄는 중…" : "끄기"}
                  </Button>
                </>
              ) : (
                <Button variant="danger" subtle size="sm" onClick={() => setConfirmEnd(true)} disabled={busy}>
                  <Ban className="h-3.5 w-3.5" /> 회원 페이지 끄기
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {confirmEnd ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-sub">
          {member.name} 회원의 회원 페이지를 끌까요? 회원은 지금부터 기록을 볼 수 없어요. (기록은 지워지지 않아요)
        </p>
      ) : token ? (
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {readOnly
            ? "PT가 끝나서 회원은 기록을 볼 수만 있어요. 끄면 회원이 이 링크로 더 이상 들어올 수 없어요."
            : "끄면 회원이 이 링크로 더 이상 들어올 수 없어요. 기록은 그대로 남고, 다시 보내면 다시 켜져요."}
        </p>
      ) : readOnly ? (
        <p className="mt-1 text-[12px] leading-relaxed text-muted">회원 페이지가 꺼져 있어요. 다시 PT를 시작하면 링크를 새로 만들 수 있어요.</p>
      ) : null}
      <Toast message={toast} />
    </div>
  );
}

// components/views/MemberAppLink.jsx — 회원앱 링크 발급·복사·재발급 (S3). PT 뷰 상단 바.
"use client";

import { useState } from "react";
import { Link2, Copy, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { copyText } from "@/lib/clipboard";

export default function MemberAppLink({ member, onMemberPatch }) {
  const token = member?.member_token || null;
  const linked = Boolean(member?.member_auth_id); // 회원이 최소 1회 로그인함
  const [busy, setBusy] = useState(false);
  const [confirmReissue, setConfirmReissue] = useState(false);
  const { toast, showToast } = useToast();

  const linkFor = (t) =>
    (typeof window !== "undefined" ? window.location.origin : "") + "/m/" + t;

  // 발급/재발급 = user_table.member_token UPDATE(.select() 하드닝) → 링크 복사.
  // ★B2(프리미엄 게이트) 때 이 supabase.update 한 곳을 서버 RPC(issue_member_token, plan 확인)로 교체 = 유일 교체점.
  const issue = async (mode) => {
    if (busy) return;
    if (!supabase) {
      showToast("데모 모드 — 실제 발급 불가");
      return;
    }
    setBusy(true);
    const newToken = crypto.randomUUID();
    const { data, error } = await supabase
      .from("user_table")
      .update({ member_token: newToken })
      .eq("id", member.id)
      .select("id, member_token"); // 하드닝: 0행이면 조용한 실패(UPDATE 정책 부재 등)
    if (error || !data || data.length === 0) {
      setBusy(false);
      setConfirmReissue(false);
      showToast("발급 실패 — 정책/0행" + (error ? ": " + error.message : ""));
      return;
    }
    onMemberPatch?.(member.id, { member_token: newToken }); // 로컬 낙관 갱신(배지·버튼 즉시 반영)
    const ok = await copyText(linkFor(newToken));
    showToast(
      ok
        ? mode === "reissue"
          ? "재발급·복사됨 (이전 링크 무효)"
          : "링크 생성·복사됨"
        : "발급됨 (복사 실패 — 아래 링크 길게 눌러 복사)"
    );
    setBusy(false);
    setConfirmReissue(false);
  };

  // 기존 토큰 복사(발급 없이)
  const copyExisting = async () => {
    if (!token) return;
    const ok = await copyText(linkFor(token));
    showToast(ok ? "링크 복사됨" : "복사 실패 — 길게 눌러 복사");
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
            <Button variant="primary" size="sm" onClick={() => issue("new")} disabled={busy}>
              <Link2 className="h-3.5 w-3.5" /> {busy ? "생성 중…" : "링크 생성"}
            </Button>
          ) : (
            <>
              <Button variant="solid" size="sm" onClick={copyExisting} disabled={busy}>
                <Copy className="h-3.5 w-3.5" /> 링크 복사
              </Button>
              {confirmReissue ? (
                <Button variant="danger" size="sm" onClick={() => issue("reissue")} disabled={busy}>
                  <Check className="h-3.5 w-3.5" /> {busy ? "재발급 중…" : "정말 재발급"}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmReissue(true)} disabled={busy}>
                  <RefreshCw className="h-3.5 w-3.5" /> 재발급
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {confirmReissue && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          재발급하면 이전 링크는 즉시 무효가 됩니다. (이미 로그인한 회원 세션은 리프레시 만료 전까지 유지 — 즉시 끊는 강제만료는 후속.)
        </p>
      )}
      <Toast message={toast} />
    </div>
  );
}

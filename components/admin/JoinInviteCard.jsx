"use client";

/* 대표 운영 탭 '개인 계정으로 쓰던 트레이너 초대'(2026-10-07 · 계획서 2단계).
   개인 요금제로 오직 트레이너를 쓰던 트레이너를 센터로 데려온다 — 회원 · 기록 · 가격표 · 사례가 함께 온다
   (회원 기록은 회원이 동의해야 옮겨짐 · 14일). 초대 = 링크 하나(7일 · 한 번만) → 트레이너가 자기 앱에서 열고 [합류하기].
   만들기 · 끄기 = rpc create_join_invite · cancel_join_invite(대표만) · 목록 = account_invite(대표 SELECT).
   합류 뒤 동의 기다리는 회원은 member_transfer(받는 센터 SELECT). */

import { useCallback, useEffect, useState } from "react";
import { Link2, Copy, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import SectionTitle from "@/components/ui/SectionTitle";
import Button from "@/components/ui/Button";

const day = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

export default function JoinInviteCard({ seatFull = false }) {
  const [list, setList] = useState(null);
  const [waiting, setWaiting] = useState([]);
  const [busy, setBusy] = useState(false);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: inv, error: e1 }, { data: tr }] = await Promise.all([
      supabase.from("account_invite").select("id, code, created_at, expires_at, used_at, canceled_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("member_transfer").select("id, member_name, status, deadline, trainer_id").eq("status", "pending").gt("deadline", new Date().toISOString()),
    ]);
    if (e1) { console.error("초대 목록 읽기 실패", e1); setList([]); return; }   // 표가 아직 없으면(SQL 전) 빈 목록
    const now = Date.now();   // 지금 열린 링크 = 안 쓰고 · 안 끄고 · 기간 안
    setList((inv || []).map((i) => ({ ...i, live: !i.used_at && !i.canceled_at && Date.parse(i.expires_at) > now })));
    setWaiting(tr || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const link = (code) => `${window.location.origin}/join-center/${code}`;
  const copy = async (code) => {
    const msg = `오직 트레이너 센터 합류 초대예요. 지금 쓰는 개인 계정으로 로그인한 채 이 링크를 열어 주세요(7일 · 한 번만).\n${link(code)}`;
    try { await navigator.clipboard.writeText(msg); showToast("링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요."); }
    catch { showToast("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요."); }
  };
  const make = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_join_invite");
    setBusy(false);
    if (error || !data) { console.error("초대 링크 만들기 실패", error); showToast("초대 링크를 만들지 못했어요. 대표만 만들 수 있어요."); return; }
    await copy(data);
    load();
  };
  const cancel = async (id) => {
    const { data, error } = await supabase.rpc("cancel_join_invite", { p_id: id });
    if (error || !data) { console.error("초대 끄기 실패", error); showToast("끄지 못했어요. 다시 시도해 주세요."); return; }
    showToast("초대 링크를 껐어요");
    load();
  };

  if (list === null) return null;
  const live = list.filter((i) => i.live);
  const used = list.filter((i) => i.used_at);

  return (
    <Card padding="lg">
      <SectionTitle icon={Link2}>개인 계정으로 쓰던 트레이너 초대</SectionTitle>
      <p className="m-0 text-[14px] leading-relaxed text-sub">
        혼자 오직 트레이너를 쓰던 트레이너를 센터로 데려와요. 회원 · 운동일지 · 가격표 · 사례가 함께 와요. 회원 기록은 <b className="text-ink">회원이 동의해야</b> 옮겨지고(14일), 트레이너의 개인 구독은 끝나며 남은 날짜만큼 자동으로 환불돼요.
      </p>
      {seatFull ? (
        <p className="m-0 mt-3 text-[13.5px] font-semibold text-danger-text">트레이너 자리(3명)가 꽉 차서 지금은 초대할 수 없어요.</p>
      ) : (
        <div className="mt-3">
          <Button variant="primary" accent="owner" size="md" onClick={make} disabled={busy}>
            <Link2 className="h-4 w-4" aria-hidden="true" /> {busy ? "만드는 중…" : "초대 링크 만들고 복사"}
          </Button>
        </div>
      )}

      {live.length > 0 && (
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {live.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-xl bg-elevate px-3 py-2.5">
              <span className="min-w-0 flex-1 text-[13.5px] text-sub">초대 링크 · {day(i.expires_at)}까지</span>
              <button type="button" onClick={() => copy(i.code)} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink hover:bg-card"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> 복사</button>
              <button type="button" onClick={() => cancel(i.id)} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-sub hover:bg-card"><X className="h-3.5 w-3.5" aria-hidden="true" /> 끄기</button>
            </li>
          ))}
        </ul>
      )}

      {(used.length > 0 || waiting.length > 0) && (
        <p className="m-0 mt-3 text-[13px] text-sub">
          {used.length > 0 && <>합류한 트레이너 {used.length}명</>}
          {used.length > 0 && waiting.length > 0 && " · "}
          {waiting.length > 0 && <>회원 동의 기다리는 중 {waiting.length}명({waiting.slice(0, 3).map((w) => w.member_name).filter(Boolean).join(", ")}{waiting.length > 3 ? " 외" : ""})</>}
        </p>
      )}
      <Toast message={toast} />
    </Card>
  );
}

"use client";
/* =========================================================================
   기능1 공지 D — 트레이너 수신. 게이트(강제·필수확인) + 재열람(벨) 2모드 한 컴포넌트.
   판정=lib/announce(mustAckUnread=게이트 · unreadAnnouncements=벨 배지 · visibleAnnouncements=재열람).
   RLS가 내 대상+전체+원장으로 스코프하지만 원장 over-fetch를 클라에서 '내 대상'만 재필터(순수함수).
   확인=announcement_read upsert(ignoreDuplicates·.select() 하드닝). !supabase/uid null/게이트0이면 오버레이 없음.
   렌더=정적 토큰만(bg-card·border-line·text-ink/sub/muted). 아이콘 lucide만.
   ========================================================================= */
import { useEffect, useState } from "react";
import { Megaphone, Pin, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mustAckUnread, unreadAnnouncements, visibleAnnouncements } from "@/lib/announce";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

export default function AnnouncementGate({ uid, onUnreadCount, reviewOpen, onCloseReview }) {
  const [anns, setAnns] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [acking, setAcking] = useState(false);
  const [err, setErr] = useState("");

  // 자체 fetch — RLS 스코프(announcement) + 본인 읽음(announcement_read). uid 들어오면 조회.
  useEffect(() => {
    if (!supabase || !uid) return;
    let cancelled = false;
    (async () => {
      const [a, r] = await Promise.all([
        supabase.from("announcement").select("*"),
        supabase.from("announcement_read").select("announcement_id"),
      ]);
      if (cancelled) return;
      setAnns(a.data || []);
      setReadIds(new Set((r.data || []).map((x) => x.announcement_id)));
    })();
    return () => { cancelled = true; };
  }, [uid]);

  // 벨 배지 수(일반+필수확인 전체 안읽음) → 부모로 콜백. anns/readIds 바뀔 때마다 재계산.
  useEffect(() => {
    onUnreadCount(unreadAnnouncements(anns, readIds, uid).length);
  }, [anns, readIds, uid, onUnreadCount]);

  // 확인 기록 — 표시된 공지들 읽음 upsert(중복은 조용히 흡수). readIds 갱신 → 재계산으로 닫힘.
  const ackAll = async (list) => {
    if (!supabase || acking || !list.length) return;
    setAcking(true);
    try {
      const rows = list.map((a) => ({ announcement_id: a.id })); // account_id·trainer_id는 DB DEFAULT
      const { error } = await supabase
        .from("announcement_read")
        .upsert(rows, { onConflict: "announcement_id,trainer_id", ignoreDuplicates: true })
        .select();
      if (error) { setErr("확인 반영 실패 — 정책 확인"); setAcking(false); return; }
      setReadIds((prev) => { const n = new Set(prev); for (const a of list) n.add(a.id); return n; });
      setErr("");
      setAcking(false);
    } catch {
      setErr("확인 반영 실패 — 정책 확인");
    } finally {
      setAcking(false);
    }
  };

  // 벨(재열람) 열리는 순간 — 안읽음 표시분을 읽음 처리(일반 공지는 여기서 읽힘 = 스펙 §1/테스트5).
  // ackAll(effect 밖 재사용)을 동기 호출하면 set-state-in-effect 룰에 걸려, 여기선 IIFE 안에 인라인(setState는 await 뒤).
  useEffect(() => {
    if (!reviewOpen || !supabase) return;
    let cancelled = false;
    (async () => {
      const unread = unreadAnnouncements(anns, readIds, uid).filter((a) => !a.must_ack);
      if (!unread.length) return;
      const rows = unread.map((a) => ({ announcement_id: a.id })); // account_id·trainer_id는 DB DEFAULT
      const { error } = await supabase
        .from("announcement_read")
        .upsert(rows, { onConflict: "announcement_id,trainer_id", ignoreDuplicates: true })
        .select();
      if (cancelled) return;
      if (error) { setErr("확인 반영 실패 — 정책 확인"); return; }
      setReadIds((prev) => { const n = new Set(prev); for (const a of unread) n.add(a.id); return n; });
    })();
    return () => { cancelled = true; };
    // reviewOpen 상승 엣지에서만. anns/readIds는 의도적 제외(재열람 중 재ack 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewOpen]);

  if (!supabase) return null;

  const gateList = mustAckUnread(anns, readIds, uid);   // 앱을 막을 것(필수확인 안읽음)
  const reviewList = visibleAnnouncements(anns, readIds, uid); // 재열람(읽음 포함)

  // 게이트(강제) — 필수확인 안읽음 있으면 앱 전체를 덮음. 배경 클릭·ESC로 안 닫힘.
  if (gateList.length > 0) {
    return (
      <Modal variant="center" dismissable={false}>
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary-strong" />
          <h2 className="text-sm font-bold text-ink">필수 확인 공지</h2>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">{gateList.length}</span>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {gateList.map((a) => (
            <div key={a.id} className="rounded-xl border border-line bg-elevate p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {a.pinned && <Pin className="h-3.5 w-3.5 text-primary-strong" />}
                <span className="text-sm font-semibold text-ink">{a.title}</span>
                <span className="ml-auto text-[10px] text-muted">{fmtDate(a.created_at)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-sub">{a.body}</p>
            </div>
          ))}
        </div>
        {err && <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600">{err}</div>}
        <Button variant="primary" size="md" fullWidth onClick={() => ackAll(gateList)} disabled={acking} className="mt-4 gap-2">
          <Check className="h-4 w-4" strokeWidth={2.5} /> {acking ? "반영 중…" : "확인했습니다"}
        </Button>
      </Modal>
    );
  }

  // 재열람(벨) — 읽음 포함 전체. X/배경으로 닫힘.
  if (reviewOpen) {
    return (
      <Modal variant="center" onClose={onCloseReview}>
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary-strong" />
          <h2 className="text-sm font-bold text-ink">공지</h2>
          <button onClick={onCloseReview} className="ml-auto rounded p-1 text-muted transition hover:text-ink" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        {reviewList.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">받은 공지가 없어요.</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {reviewList.map((a) => (
              <div key={a.id} className={`rounded-xl border border-line bg-elevate p-3 ${a.read ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.pinned && <Pin className="h-3.5 w-3.5 text-primary-strong" />}
                  <span className="text-sm font-semibold text-ink">{a.title}</span>
                  {a.must_ack && <Badge tone="primary">필수확인</Badge>}
                  <span className="ml-auto text-[10px] text-muted">{fmtDate(a.created_at)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-sub">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    );
  }

  return null;
}

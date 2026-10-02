"use client";

/* =========================================================================
   DeckList — 세일즈북 탭 첫 화면 '발표 자료'(2단계 · 2026-10-02 대표 요청).
   "세일즈북 탭 → 회원 누르기 → 바로 발표". 세일즈북이 저장된 회원만 최근 순으로 보여 준다.
   - OT 세일즈북(ot_log.report.salesbook · 2차 OT 준비하기에서 만듦): 여기서 바로 발표·편집(장 구성·사례 넣기).
   - 재등록 세일즈북(session_log.report.reg_salesbook · 재등록 준비에서 만듦): 숫자 계산이 그 화면에 있어 그 화면으로 열어 준다.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Play, Receipt, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useMembers } from "@/components/app/MembersProvider";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Badge from "@/components/ui/Badge";
import FilterChip from "@/components/ui/FilterChip";
import DeckLauncher, { useSalesbookAssets } from "@/components/salesbook/DeckLauncher";
import PriceSheet from "@/components/salesbook/PriceSheet";
import FirstProposalLauncher from "@/components/salesbook/FirstProposalLauncher";
import { viewFor } from "@/lib/memberStatus";

const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function DeckList() {
  const router = useRouter();
  const { members, myUid } = useMembers();
  const { toast, showToast } = useToast();
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // { row, member, editable }
  const [priceOpen, setPriceOpen] = useState(false);
  const { packages, trainer } = useSalesbookAssets();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setRows([]); return; }
      const [ot, reg] = await Promise.all([
        supabase.from("ot_log").select("id, user_id, ot_round, created_at, report").not("report->salesbook", "is", null),
        supabase.from("session_log").select("id, user_id, created_at, report").not("report->reg_salesbook", "is", null),
      ]);
      if (ot.error) console.error("세일즈북 목록(OT) 실패", ot.error);
      if (reg.error) console.error("세일즈북 목록(재등록) 실패", reg.error);
      const latest = new Map(); // 회원·종류별 최신 1개
      const put = (k, r) => { const cur = latest.get(k); if (!cur || new Date(r.at) > new Date(cur.at)) latest.set(k, r); };
      for (const r of ot.data || []) {
        const m = r.report?.salesbookMeta || {};
        put(`ot|${r.user_id}`, { kind: "ot", row: r, user_id: r.user_id, at: m.editedAt || m.generatedAt || r.created_at, round: r.ot_round });
      }
      for (const r of reg.data || []) {
        put(`reg|${r.user_id}`, { kind: "reg", row: r, user_id: r.user_id, at: r.report?.regSalesbookMeta?.generatedAt || r.created_at });
      }
      if (!cancelled) setRows([...latest.values()]);
    })();
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const list = useMemo(() => {
    const mineOnly = members.some((m) => m.trainer_id === myUid);
    // 2차 세일즈북이 아직 없는 OT 회원은 '1차 제안'(AI 없이 바로 만드는 짧은 버전)으로 함께 띄운다.
    const hasOt = new Set((rows || []).filter((r) => r.kind === "ot").map((r) => r.user_id));
    const firsts = members.filter((m) => viewFor(m) === "ot" && !hasOt.has(m.id))
      .map((m) => ({ kind: "first", user_id: m.id, at: m.created_at || null }));
    return [...(rows || []), ...firsts]
      .map((r) => ({ ...r, member: byId.get(r.user_id) }))
      .filter((r) => r.member && (!mineOnly || r.member.trainer_id === myUid))
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => !q.trim() || (r.member.name || "").includes(q.trim()))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [rows, byId, members, myUid, kind, q]);

  const openDeck = (r, editable) => {
    if (r.kind === "reg") { router.push(`/pt/${r.user_id}/renewal?sb=1`); return; }
    setOpen({ kind: r.kind, row: r.row, member: r.member, editable });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.03em] text-ink">발표 자료</h1>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-sub">
          회원을 누르면 <b className="font-semibold text-primary-strong">바로 발표 화면</b>이 열려요. 편집에서 장 순서를 바꾸고 사례 보관함의 변화 사례를 넣을 수 있어요.
        </p>
      </div>
        {/* 회원이 "가격표 보여주세요" 할 때 — 회원을 안 골라도 바로. 설정의 패키지를 그대로 읽어 늘 최신. */}
        <button type="button" onClick={() => setPriceOpen(true)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[13px] font-semibold text-ink shadow-sm transition hover:border-line-strong">
          <Receipt className="h-4 w-4 text-primary-strong" aria-hidden="true" /> 가격표
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip selected={kind === "all"} onClick={() => setKind("all")}>전체</FilterChip>
        <FilterChip selected={kind === "first"} onClick={() => setKind("first")}>1차 제안</FilterChip>
        <FilterChip selected={kind === "ot"} onClick={() => setKind("ot")}>2차 OT</FilterChip>
        <FilterChip selected={kind === "reg"} onClick={() => setKind("reg")}>재등록</FilterChip>
        <label className="ml-auto flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[13px] text-sub">
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회원 이름" aria-label="회원 이름으로 찾기" className="w-28 bg-transparent outline-none placeholder:text-muted" />
        </label>
      </div>

      {rows == null ? (
        <p className="text-[13px] text-muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-8 text-center">
          <p className="m-0 text-[15px] font-semibold text-ink">{q || kind !== "all" ? "맞는 세일즈북이 없어요" : "아직 만든 세일즈북이 없어요"}</p>
          <p className="m-0 mt-1 text-[13px] text-sub">OT 회원은 1차 제안이 바로 떠요. 2차 OT 준비하기·재등록 준비에서 세일즈북을 만들면 여기 모여요.</p>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={`${r.kind}-${r.user_id}`} className="flex items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-sm">
              <button type="button" onClick={() => openDeck(r, false)}
                className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 text-left transition hover:bg-elevate">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white"><Play className="h-4 w-4" fill="currentColor" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold text-ink">{r.member.name}</span>
                    <Badge tone={r.kind === "reg" ? "pt" : "ot"}>{r.kind === "ot" ? `OT ${r.round || ""}차` : r.kind === "first" ? "1차 제안" : "재등록"}</Badge>
                  </span>
                  <span className="block text-[12px] text-muted">{r.kind === "first" ? "AI 없이 바로 · " : `${when(r.at)} · `}{r.kind === "ot" && (r.row.report?.salesbook?.deck?.cases || []).length ? `사례 ${r.row.report.salesbook.deck.cases.length}개 · ` : ""}눌러서 발표</span>
                </span>
              </button>
              {r.kind !== "reg" && (
                <button type="button" onClick={() => openDeck(r, true)} aria-label={`${r.member.name} 세일즈북 편집`}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-sub transition hover:bg-elevate hover:text-ink">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> 편집
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && open.kind === "first" && (
        <FirstProposalLauncher member={open.member} editable={open.editable} showToast={showToast} onClose={() => setOpen(null)} />
      )}
      {open && open.kind !== "first" && (
        <DeckLauncher
          member={open.member}
          row={open.row}
          editable={open.editable}
          startPresent={!open.editable}
          showToast={showToast}
          onSaved={(report) => setRows((rs) => rs.map((x) => (x.row.id === open.row.id ? { ...x, row: { ...x.row, report }, at: report.salesbookMeta?.editedAt || x.at } : x)))}
          onClose={() => setOpen(null)}
        />
      )}
      {priceOpen && <PriceSheet packages={packages} trainerName={trainer?.display_name || ""} onClose={() => setPriceOpen(false)} />}
      <Toast message={toast} />
    </div>
  );
}

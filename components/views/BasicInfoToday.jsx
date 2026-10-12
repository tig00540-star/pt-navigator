"use client";

/* 기본정보 마무리(2026-10-12 · 회원 한꺼번에 등록 뒤) — 내 PT 회원 중 '회당 단가'(최근 계약)나 '휴대폰'이 빈 회원.
   단가는 이 카드에서 바로 넣고(PriceFix), 휴대폰은 회원 정보 수정 창. 다 채우면 카드가 사라진다.
   보이는 곳: '오늘' 탭 · 폰 홈(오늘 카드 아래 · 있을 때만) · 넓은 홈. 지금 기록만 읽음(새 저장 없음). */

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchByIds } from "@/lib/fetchByIds";
import { useAppUi } from "@/components/app/AppChrome";
import ToneCard from "@/components/ui/ToneCard";
import SectionHeader from "@/components/ui/SectionHeader";
import PriceFix from "@/components/members/PriceFix";

export default function BasicInfoToday({ members = [] }) {
  const { openMemberEdit } = useAppUi();
  const [missingPrice, setMissingPrice] = useState(() => new Map());   // member id → 최근 계약 id
  const pts = (members || []).filter((m) => m && !m.hidden && m.status === "pt_active");
  const key = pts.map((m) => m.id).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const ids = key ? key.split(",") : [];
      if (!ids.length) { if (!cancelled) setMissingPrice(new Map()); return; }
      const { data, error } = await fetchByIds(supabase, "session_log", "id, user_id, price_per_session, started_at, handed_over", "user_id", ids);
      if (error) { console.error("계약 단가 조회 실패", error); return; }
      const latest = new Map();
      for (const c of data || []) {
        if (c.handed_over) continue;
        const cur = latest.get(c.user_id);
        if (!cur || String(c.started_at ?? "") > String(cur.started_at ?? "")) latest.set(c.user_id, c);
      }
      const out = new Map();
      for (const [uid, c] of latest) if (!(Number(c.price_per_session) > 0)) out.set(uid, c.id);
      if (!cancelled) setMissingPrice(out);
    })();
    return () => { cancelled = true; };
  }, [key]);

  const rows = pts
    .map((m) => ({ m, priceContract: missingPrice.get(m.id) || null, noPhone: !String(m.phone_number || "").trim() }))
    .filter((r) => r.priceContract || r.noPhone);
  if (!rows.length) return null;

  return (
    <ToneCard tone="reapproach">
      <SectionHeader tone="reapproach" icon={ClipboardList} title="기본정보를 마무리해 주세요" count={rows.length}
        hint="회당 단가가 비어 있으면 급여 계산에서 0원이에요. 휴대폰은 회원 전용 페이지 로그인에 필요해요." />
      <div className="grid gap-2">
        {rows.map(({ m, priceContract, noPhone }) => (
          <div key={m.id} className="rounded-xl bg-elevate px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-ink">{m.name}</span>
              <span className="text-[12px] text-muted">{[priceContract && "회당 단가", noPhone && "휴대폰"].filter(Boolean).join(" · ")}</span>
            </div>
            {priceContract && (
              <div className="mt-2">
                <PriceFix contractId={priceContract}
                  onSaved={() => setMissingPrice((mp) => { const n = new Map(mp); n.delete(m.id); return n; })} />
              </div>
            )}
            {noPhone && (
              <button type="button" onClick={() => openMemberEdit(m.id)}
                className="mt-2 min-h-[36px] text-[13px] font-semibold text-primary-strong underline-offset-2 hover:underline">
                휴대폰 넣기 · 정보 수정
              </button>
            )}
          </div>
        ))}
      </div>
    </ToneCard>
  );
}

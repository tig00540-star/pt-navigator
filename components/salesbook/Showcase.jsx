"use client";

/* =========================================================================
   1차 OT '내 회원님 변화 모음집'(2026-10-11 대표 결정).
   1차 OT엔 회원마다 만드는 세일즈북 대신, 트레이너가 한 번 골라 두고 어떤 회원에게나 보여 주는 모음집.
     장: 트레이너 소개(설정 '내 소개 페이지') → 변화 사례(2개씩) → 관리 모습(대화 캡처 · 회원 페이지 화면 · 2개씩 = 증거)
         → 등록 혜택(설정 '신규 등록 혜택 장'을 켰을 때 = 약속) → 약속
   저장 = trainer_profile.showcase { cases: [id], care: [id] } (순서대로 · 본인 upsert).
   사진 · 후기 · 캡처는 동의 체크한 것만(caseUsable) — 고르기에서도 막고, 발표 때도 빠진다(useDeckCases).
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Play, Pencil, Plus, X, Images } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import SalesbookView from "@/components/views/SalesbookView";
import { loadMyCases } from "@/components/salesbook/caseData";
import { caseSummary } from "@/components/salesbook/DeckParts";
import { caseKindLabel, careSubLabel } from "@/lib/salesCase";
import { caseUsable } from "@/lib/trainerIntro";

export const SHOWCASE_MAX_CASES = 12;
export const SHOWCASE_MAX_CARE = 8;
const VOW = "다음 변화는 회원님 차례예요. 목표까지 매 수업 기록하고 함께 확인할게요.";

const readShowcase = (p) => {
  const s = p?.showcase && typeof p.showcase === "object" ? p.showcase : {};
  return { cases: Array.isArray(s.cases) ? s.cases : [], care: Array.isArray(s.care) ? s.care : [] };
};

/* 세일즈북 탭 맨 위 카드 — 발표 · 고르기 */
export function ShowcaseCard({ packages = [], trainer, ready, showToast }) {
  const [override, setOverride] = useState(null);   // 고르고 저장한 직후 값(다시 읽지 않고 바로 반영)
  const sc = override || readShowcase(trainer);
  const [present, setPresent] = useState(false);
  const [editing, setEditing] = useState(false);
  const count = sc.cases.length + sc.care.length;
  const ok = ready && (!trainer || "showcase" in trainer);   // 프로필 행에 칸이 없으면(SQL 전) '준비 중'

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong"><Images className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[16px] font-bold text-ink">내 회원님 변화 모음집 <span className="ml-1 rounded-full bg-elevate px-2 py-0.5 align-middle text-[12px] font-semibold text-sub">1차 OT용</span></p>
          <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-sub">
            {!ready ? "불러오는 중이에요" : !ok ? "이 기능은 아직 준비 중이에요."
              : count ? `변화 사례 ${sc.cases.length}개 · 관리 모습 ${sc.care.length}개 · 한 번 골라 두면 어떤 회원에게나 그대로 보여 줘요.`
              : "한 번 골라 두면 1차 OT마다 그대로 보여 줘요. 변화 사례와 관리 모습(대화 캡처 · 회원 페이지 화면)을 골라 주세요."}
          </p>
        </div>
        {ok && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="primary" onClick={() => setPresent(true)} disabled={!count} className="flex-1 sm:flex-none"><Play className="h-4 w-4" fill="currentColor" aria-hidden="true" /> 발표</Button>
            <Button onClick={() => setEditing(true)} className="flex-1 sm:flex-none"><Pencil className="h-4 w-4" aria-hidden="true" /> {count ? "고르기" : "만들기"}</Button>
          </div>
        )}
      </div>
      {present && (
        <SalesbookView
          showcase
          salesbook={{ deck: { cases: sc.cases, care: sc.care }, closing: { vow: VOW, services: [] } }}
          member={null}
          trainer={trainer}
          benefits={trainer?.salesbook_benefits?.enabled ? (trainer.salesbook_benefits.items || []) : []}
          packages={packages}
          startPresent
          onClose={() => setPresent(false)}
        />
      )}
      {editing && <ShowcaseEditor initial={sc} onClose={() => setEditing(false)} onSaved={(v) => { setOverride(v); setEditing(false); showToast?.("모음집을 저장했어요"); }} />}
    </section>
  );
}

function PickedList({ ids, rows, onMove, onRemove }) {
  const picked = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
  if (!picked.length) return <p className="m-0 text-[13px] text-muted">아직 고른 게 없어요.</p>;
  return (
    <ol className="m-0 list-none space-y-1.5 p-0">
      {picked.map((c, i) => (
        <li key={c.id} className="flex items-center gap-1.5 rounded-xl border border-line bg-elevate px-3 py-2">
          <span className="w-5 shrink-0 text-[13px] font-bold tabular-nums text-muted">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">{c.label || caseKindLabel(c.kind)}</span>
            <span className="block truncate text-[12px] text-muted">{c.kind === "care" ? careSubLabel(c.data?.sub) : caseKindLabel(c.kind)} · {caseSummary(c)}</span>
          </span>
          <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="위로" className="flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-card disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => onMove(i, 1)} disabled={i === picked.length - 1} aria-label="아래로" className="flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-card disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => onRemove(c.id)} aria-label="빼기" className="flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-card hover:text-danger-text"><X className="h-4 w-4" /></button>
        </li>
      ))}
    </ol>
  );
}

function AddList({ rows, ids, max, onAdd }) {
  const rest = rows.filter((r) => !ids.includes(r.id));
  if (!rest.length) return null;
  return (
    <ul className="m-0 mt-2 max-h-[260px] list-none space-y-1 overflow-y-auto p-0">
      {rest.map((c) => {
        const ok = caseUsable(c);
        const full = ids.length >= max;
        return (
          <li key={c.id}>
            <button type="button" onClick={() => onAdd(c.id)} disabled={!ok || full}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-left transition hover:border-line-strong disabled:opacity-55">
              <Plus className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{c.label || caseKindLabel(c.kind)}</span>
                <span className="block truncate text-[12px] text-muted">
                  {c.kind === "care" ? careSubLabel(c.data?.sub) : `${caseKindLabel(c.kind)}${c.data?.category ? ` · ${c.data.category}` : ""}`} · {caseSummary(c)}
                  {!ok && " · 보관함에서 '동의받았어요' 체크가 필요해요"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* 고르기 — 변화 사례(최대 12) · 관리 모습(최대 8) · 순서 */
function ShowcaseEditor({ initial, onClose, onSaved }) {
  const [rows, setRows] = useState(null);
  const [cases, setCases] = useState(initial.cases);
  const [care, setCare] = useState(initial.care);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: au } = (await supabase?.auth.getUser()) || {};
      const { data } = await loadMyCases(au?.user?.id);
      if (!cancelled) setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const caseRows = useMemo(() => (rows || []).filter((r) => r.kind !== "care"), [rows]);
  const careRows = useMemo(() => (rows || []).filter((r) => r.kind === "care"), [rows]);
  const mover = (set) => (i, d) => set((x) => { const j = i + d; if (j < 0 || j >= x.length) return x; const n = [...x]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  // 보관함에서 빠진 것 · 동의 체크가 풀린 것은 저장할 때 같이 정리
  const clean = (ids, list) => ids.filter((id) => caseUsable(list.find((r) => r.id === id)));

  const save = async () => {
    if (saving || !supabase) return;
    setSaving(true); setErr("");
    try {
      const { data: au } = await supabase.auth.getUser();
      const showcase = { cases: clean(cases, caseRows), care: clean(care, careRows), updatedAt: new Date().toISOString() };
      const { data, error } = await supabase.from("trainer_profile")
        .upsert({ trainer_id: au?.user?.id, showcase, updated_at: new Date().toISOString() }, { onConflict: "trainer_id" }).select("showcase");
      if (error || !data?.length) { console.error("모음집 저장 실패", error); setErr("저장하지 못했어요. 다시 시도해 주세요."); return; }
      onSaved(showcase);
    } catch { setErr("저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };

  return (
    <Modal variant="sheet" title="변화 모음집 고르기" subtitle="1차 OT에서 어떤 회원에게나 이 순서대로 보여 줘요" onClose={onClose}
      footer={<div className="flex flex-col gap-1.5">{err && <p className="m-0 text-[13px] text-danger-text">{err}</p>}<Button variant="primary" fullWidth onClick={save} disabled={saving || rows == null}>{saving ? "저장 중이에요" : "저장"}</Button></div>}>
      {rows == null ? <p className="text-[13px] text-muted">불러오는 중이에요</p> : (
        <div className="space-y-6">
          <p className="m-0 text-[13px] leading-relaxed text-sub">첫 장은 설정의 <b className="font-semibold text-ink">내 소개 페이지</b>(이름 · 한 줄 소개 · 전문 분야), 마지막 장은 약속이에요. 담을 거리는 <Link href="/salesbook/cases" className="font-semibold text-primary-strong underline underline-offset-2">사례 보관함</Link>에서 먼저 담아 주세요.</p>
          <section>
            <p className="m-0 mb-2 flex items-center justify-between text-[14px] font-bold text-ink">변화 사례 <span className="text-[12px] font-normal text-muted">{cases.length}/{SHOWCASE_MAX_CASES} · 2개씩 한 장</span></p>
            <PickedList ids={cases} rows={caseRows} onMove={mover(setCases)} onRemove={(id) => setCases((x) => x.filter((y) => y !== id))} />
            {caseRows.length ? <AddList rows={caseRows} ids={cases} max={SHOWCASE_MAX_CASES} onAdd={(id) => setCases((x) => [...x, id])} />
              : <p className="m-0 mt-2 text-[13px] text-muted">보관함에 변화 사례가 없어요(비포 · 애프터 · 인바디 · 운동 · 후기).</p>}
          </section>
          <section>
            <p className="m-0 mb-2 flex items-center justify-between text-[14px] font-bold text-ink">관리 모습 <span className="text-[12px] font-normal text-muted">{care.length}/{SHOWCASE_MAX_CARE} · 2개씩 한 장</span></p>
            <PickedList ids={care} rows={careRows} onMove={mover(setCare)} onRemove={(id) => setCare((x) => x.filter((y) => y !== id))} />
            {careRows.length ? <AddList rows={careRows} ids={care} max={SHOWCASE_MAX_CARE} onAdd={(id) => setCare((x) => [...x, id])} />
              : <p className="m-0 mt-2 text-[13px] text-muted">보관함에 관리 모습이 없어요. 사례 보관함 › &lsquo;관리 모습&rsquo;으로 대화 캡처나 회원 페이지 화면을 담아 주세요.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}

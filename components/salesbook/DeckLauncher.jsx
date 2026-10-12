"use client";

/* =========================================================================
   DeckLauncher — 저장된 OT 세일즈북(ot_log.report.salesbook)을 어디서든 바로 연다(2단계).
   세일즈북 탭 목록·OT 대시보드(폰)가 같이 쓴다. 발표(present)로 바로 열거나 편집(장 구성 포함)으로 연다.
   재료: 내 PT 패키지(가격) · 트레이너 프로필(표지·서명·혜택 장) — 회원 무관이라 한 번 읽는다.
   저장: 최신 report를 다시 읽어 salesbook만 바꿔 쓴다(브리핑·피드백 등 다른 키 보존 · 교훈1 .select()).
   ========================================================================= */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SalesbookView from "@/components/views/SalesbookView";

/* 회원의 담당 트레이너 가격표(노출 켠 것) — 대본 · 세일즈북의 추천 가격은 담당 트레이너 가격표 기준이다(2026-10-12 ·
   가격표는 트레이너마다 따로). 대표는 계정 안 모든 트레이너 가격표를 읽을 수 있다(pt_package 보안 규칙 auth_is_owner).
   다른 트레이너는 남의 가격표를 못 읽으니(0행) 그땐 보는 사람 가격표로 대신한다. 담당이 없어도 보는 사람 것. */
export async function loadPackagesFor(trainerId) {
  if (!supabase) return [];
  const { data: au } = await supabase.auth.getUser();
  const uid = au?.user?.id ?? null;
  const q = (tid) => supabase.from("pt_package").select("*").eq("trainer_id", tid).eq("active", true)
    .order("sort", { ascending: true }).order("created_at", { ascending: true });
  const want = trainerId || uid;
  if (!want) return [];
  const { data } = await q(want);
  if (data?.length || !uid || want === uid) return data || [];
  const { data: mine } = await q(uid);
  return mine || [];
}

export function useSalesbookAssets() {
  const [assets, setAssets] = useState({ packages: [], trainer: null, ready: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setAssets((a) => ({ ...a, ready: true })); return; }
      // 실패해도 ready=true(패키지 · 프로필 없이라도 화면은 연다 · '불러오는 중' 멈춤 방지 2026-10-06).
      try {
        const { data: au } = await supabase.auth.getUser();
        const uid = au?.user?.id ?? null;
        if (!uid) { if (!cancelled) setAssets((a) => ({ ...a, ready: true })); return; }
        const [{ data: pkgs }, { data: prof }] = await Promise.all([
          supabase.from("pt_package").select("*").eq("trainer_id", uid).eq("active", true)
            .order("sort", { ascending: true }).order("created_at", { ascending: true }),
          supabase.from("trainer_profile").select("*").eq("trainer_id", uid).maybeSingle(),
        ]);
        if (!cancelled) setAssets({ packages: pkgs || [], trainer: prof || null, ready: true });
      } catch (e) {
        console.error("세일즈북 패키지 · 프로필 읽기 실패", e);
        if (!cancelled) setAssets((a) => ({ ...a, ready: true }));
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return assets;
}

export default function DeckLauncher({ member, row, editable = false, startPresent = false, onClose, onSaved, showToast }) {
  const { packages: myPackages, trainer } = useSalesbookAssets();
  const [report, setReport] = useState(row?.report || {});
  // 가격은 회원의 담당 트레이너 가격표로(대표가 다른 트레이너 회원의 세일즈북을 열 때도 맞는 가격 · loadPackagesFor).
  const [memberPackages, setMemberPackages] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!member?.trainer_id) return undefined;
    loadPackagesFor(member.trainer_id)
      .then((p) => { if (!cancelled) setMemberPackages(p); })
      .catch((e) => console.error("담당 트레이너 가격표 읽기 실패", e));
    return () => { cancelled = true; };
  }, [member?.trainer_id]);
  const packages = memberPackages ?? myPackages;

  const save = async (edited) => {
    if (!supabase || !row?.id) { showToast?.("데모 모드라 저장할 수 없어요."); return false; }
    try {
      const { data: fresh } = await supabase.from("ot_log").select("report").eq("id", row.id).maybeSingle();
      const base = fresh?.report || report || {};
      const next = { ...base, salesbook: edited, salesbookMeta: { ...(base.salesbookMeta || {}), editedAt: new Date().toISOString() } };
      const { data, error } = await supabase.from("ot_log").update({ report: next }).eq("id", row.id).select("id");
      if (error || !data?.length) { showToast?.("세일즈북을 저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return false; }
      setReport(next);
      onSaved?.(next);
      showToast?.("세일즈북을 저장했어요");
      return true;
    } catch {
      showToast?.("세일즈북을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      return false;
    }
  };

  if (!report?.salesbook) return null;
  return (
    <SalesbookView
      salesbook={report.salesbook}
      member={member}
      trainer={trainer}
      packages={packages}
      recommendedProgram={report.brief?.recommended_program || null}
      benefits={trainer?.salesbook_benefits?.enabled ? (trainer.salesbook_benefits.items || []) : []}
      editable={editable}
      startPresent={startPresent}
      onSave={save}
      onClose={onClose}
    />
  );
}

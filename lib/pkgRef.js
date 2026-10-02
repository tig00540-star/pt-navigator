/* =========================================================================
   추천 패키지 찾기(2026-10-02 버그 수정) — AI는 패키지를 '가격표의 몇 번째'(ref 순번)로만 골랐다.
   화면이 그 순번을 '지금 보는 사람의 가격표'에서 찾다 보니, 다른 트레이너가 보거나 가격표 순서가 바뀌면
   대사(30회 · 1,650,000원)와 다른 패키지(20회 · 1,300,000원)가 붙었다.
   → 서버가 만들 때 고른 패키지를 통째로 저장(snapPkg)하고, 화면은 그걸로 찾는다(resolvePkg).
     · 저장값이 있으면: 가격표에서 같은 패키지(id)를 찾아 지금 가격으로 · 없으면 저장값 그대로.
     · 옛 리포트(저장값 없음): 순번으로 찾되, 설명 글의 회차(예 "30회")와 다르면 붙이지 않는다(틀린 가격보다 빈칸).
   ========================================================================= */

export function snapPkg(p) {
  if (!p || typeof p !== "object") return null;
  return {
    id: p.id ?? null,
    name: p.name ?? "",
    sessions: p.sessions ?? null,
    price: p.price ?? null,
    list_price: p.list_price ?? null,
    duration_label: p.duration_label ?? null,
  };
}

const sessionsIn = (text) => {
  const m = String(text || "").match(/(\d+)\s*회/);
  return m ? Number(m[1]) : null;
};

export function resolvePkg({ snap = null, ref = null, packages = [], hint = "" } = {}) {
  const list = Array.isArray(packages) ? packages : [];
  if (snap && typeof snap === "object") {
    const live = snap.id ? list.find((p) => p.id === snap.id) : null;
    return live || (snap.price != null ? snap : null);
  }
  const p = Number.isInteger(ref) && ref >= 0 && ref < list.length ? list[ref] : null;
  if (!p) return null;
  const n = sessionsIn(hint);
  if (n != null && p.sessions != null && n !== Number(p.sessions)) return null;
  return p;
}

// 서버 — AI 결과에 고른 패키지를 붙인다(recommended_program.pick_pkg/alt_pkg · plans[].pkg).
export function attachPkgSnapshots(out, packages) {
  if (!out || typeof out !== "object" || !Array.isArray(packages) || !packages.length) return out;
  const at = (i) => (Number.isInteger(i) && i >= 0 && i < packages.length ? snapPkg(packages[i]) : null);
  const rp = out.recommended_program;
  if (rp && typeof rp === "object") {
    rp.pick_pkg = at(rp.pick_ref);
    rp.alt_pkg = at(rp.alt_ref);
  }
  if (Array.isArray(out.plans)) out.plans = out.plans.map((pl) => (pl && typeof pl === "object" ? { ...pl, pkg: at(pl.ref) } : pl));
  return out;
}

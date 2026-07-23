"use client";
/* =========================================================================
   RegSalesbookView — 재등록 회원 대면 세일즈북(present 전용). 작업 F.
   ★독자 = 회원 본인. SalesbookView(2차 OT)의 present/전체화면/인쇄/네비/사진로더/
     Slide 스캐폴드 + SalesbookStyle을 그대로 이식하고, 슬라이드 내용만 재등록용으로 교체.
   ★숫자(변화량·횟수·무게·금액)는 앱이 데이터에서 직접 렌더 — AI는 해석·프레이밍 텍스트만.
     · change = 앱이 계산해 넘긴 숫자(journey/inbody/exercises) → 비포애프터 표.
     · 금액 = packages[ref].price(won). 편집 모드 없음(present 전용 · v1).
   슬라이드: 1 표지 · 2 여정 · 3 비포애프터 표 · [4 사진(있을 때만)] · 로드맵 · 멈추면/이어가면 · 플랜 · 약속.
     ★사진 슬라이드는 유무로 가변 → slides 배열을 만들어 total(=slides.length)을 Slide에 전달.
   ========================================================================= */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, X, Check, Camera, Maximize, Minimize, Presentation } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import BrandMark from "@/components/ui/BrandMark";
import Wordmark from "@/components/ui/Wordmark";

// ── 가격 해석(SalesbookView #2 미러) — 모델 plan.ref를 안 믿는다. A=pick_ref, B=alt_ref 우선, 유효성 검증. ──
function resolvePackage(planIndex, plan, recommendedProgram, packages) {
  const list = Array.isArray(packages) ? packages : [];
  const rp = recommendedProgram || {};
  const valid = (n) => Number.isInteger(n) && n >= 0 && n < list.length;
  let ref = planIndex === 0 ? rp.pick_ref : rp.alt_ref;
  if (!valid(ref)) ref = plan?.ref;
  return valid(ref) ? list[ref] : null;
}

/* 콘텐츠를 프레임에 맞게 자동 축소(fit-to-scale) — SalesbookView와 동일. transform은 scrollHeight에 영향 없어 재측정 루프 없음. */
function useFitScale() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const content = ref.current, pad = content?.parentElement, frame = pad?.parentElement;
    if (!content || !pad || !frame) return;
    const fit = () => {
      const cs = getComputedStyle(pad);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const avail = frame.clientHeight - padY;
      const natural = content.scrollHeight;
      content.style.transform = natural > avail ? `scale(${avail / natural})` : "";
    };
    const ro = new ResizeObserver(fit);
    ro.observe(frame); ro.observe(content);
    window.addEventListener("resize", fit);
    fit();
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return ref;
}

/* ── 슬라이드 셸(present 전용 · editable 없음) — total은 가변이라 prop으로 받는다. ── */
function Slide({ n, total, children, className = "", idx = 0 }) {
  const fitRef = useFitScale();
  const active = idx === n - 1;
  return (
    <section className={`sb-slide ${className}`}>
      <div className="sb-slide-inner">
        <div className="sb-pad"><div ref={fitRef} className="sb-fit"><div className={`sb-build ${active ? "sb-play" : ""}`}>{children}</div></div></div>
        <div className="sb-corner">
          <BrandMark className="h-4 w-4" />
          <span className="text-[10px] font-semibold tracking-[0.02em] text-muted">{n} / {total}</span>
        </div>
      </div>
    </section>
  );
}

/* 통계 타일(여정 슬라이드) — 모듈 레벨(render 중 컴포넌트 생성 금지 · react-hooks/static-components). */
function StatTile({ label, val, unit, tone }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border px-3 py-4 text-center ${tone ? "border-primary/25 bg-primary-soft" : "border-line bg-elevate"}`}>
      <div className="font-mono text-[clamp(22px,4vw,34px)] font-extrabold text-primary-strong">
        {val ?? "—"}{val != null && unit ? <span className="ml-0.5 text-[13px] font-semibold text-muted">{unit}</span> : null}
      </div>
      <div className="mt-1 text-[11px] font-semibold text-sub">{label}</div>
    </div>
  );
}

/* 슬라이드 상단 라벨 — SalesbookView와 동일(sb-stg·--sb-i passthrough). */
function SlideHead({ eyebrow, aux, className = "", style }) {
  return (
    <div className={`mb-3 flex items-center gap-2 ${className}`} style={style}>
      <span className="h-4 w-1 rounded-full bg-primary" />
      <span className="text-[12px] font-bold tracking-[0.02em] text-primary-strong">{eyebrow}</span>
      {aux && <span className="text-[11px] text-muted">{aux}</span>}
    </div>
  );
}

export default function RegSalesbookView({ regSalesbook, member, trainer, packages = [], recommendedProgram = null, change = null, onClose }) {
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState([]);
  const [urls, setUrls] = useState({});
  const sbRootRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const fsEnabled = typeof document !== "undefined" && document.fullscreenEnabled;
  useEffect(() => {
    const on = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else sbRootRef.current?.requestFullscreen?.();
  };

  // 회원 사진 로드(서명 URL) — SalesbookView 로더 이식. 재등록은 오래된 before ↔ 최신 after/progress 페어.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { if (!cancelled) { setRows([]); setUrls({}); } return; }
      try {
        const { data } = await supabase
          .from("member_photo")
          .select("storage_path, label, taken_on")
          .eq("user_id", member.id)
          .order("taken_on", { ascending: false })
          .limit(12);
        const list = data || [];
        let map = {};
        if (list.length) {
          const { data: signed } = await supabase.storage
            .from("member-photos")
            .createSignedUrls(list.map((p) => p.storage_path), 3600);
          (signed || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
        }
        if (!cancelled) { setRows(list); setUrls(map); }
      } catch {
        if (!cancelled) { setRows([]); setUrls({}); }
      }
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  // ── 파생(렌더마다 · 순수) ──
  const sb = regSalesbook || {};
  const ch = change || {};
  const tr = trainer || {};
  const j = ch.journey || {};
  const inbody = Array.isArray(ch.inbody) ? ch.inbody : [];
  const exercises = Array.isArray(ch.exercises) ? ch.exercises : [];
  const plans = Array.isArray(sb.plans) ? sb.plans.slice(0, 2) : [];
  const stages = Array.isArray(sb.roadmap?.stages) ? sb.roadmap.stages : [];
  const curStep = Number.isInteger(sb.roadmap?.current_step) ? sb.roadmap.current_step : 1;
  const hasChange = inbody.length > 0 || exercises.length > 0;
  // 인바디 델타 방향(goodDir): good=primary-strong · muscle/bmr=up·fat=down이 goodDir면 좋음, 반대면 rose.
  const deltaCls = (r) => {
    if (r.first == null || r.latest == null) return "text-muted";
    const d = r.latest - r.first;
    if (d === 0 || !r.goodDir) return "text-muted";
    return ((d > 0 && r.goodDir === "up") || (d < 0 && r.goodDir === "down")) ? "text-primary-strong" : "text-rose-600";
  };
  const fmtD = (r) => { const d = r.latest - r.first; return (d > 0 ? "+" : "") + Math.round(d * 10) / 10; };

  // 사진 페어 (아래 파생) — 오래된 before ↔ 최신 after/progress.
  const oldestOf = (label) => rows.filter((r) => r.label === label).sort((a, b) => (a.taken_on < b.taken_on ? -1 : 1))[0] || null;
  const latestOf = (label) => rows.filter((r) => r.label === label).sort((a, b) => (a.taken_on > b.taken_on ? -1 : 1))[0] || null;
  const before = oldestOf("before") || oldestOf("progress");
  const after = latestOf("after") || latestOf("progress");
  const hasPhotos = !!(before && after && urls[before.storage_path] && urls[after.storage_path]);

  // ── 슬라이드 노드 배열(사진 유무로 가변) → total = slides.length ──
  const slides = [];

  // ① 표지 (TRAINING PLAN → 변화 리포트)
  slides.push(
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="sb-stg flex items-center gap-2">
        <BrandMark accent="trainer" title="오직 트레이너" className="h-7 w-7 shrink-0 rounded-lg" />
        <Wordmark className="text-[15px] font-extrabold" />
      </div>
      <div className="sb-stg" style={{ "--sb-i": 1 }}>
        <p className="text-[13px] font-semibold text-primary-strong">변화 리포트</p>
        <h1 className="mt-1 text-[clamp(28px,5vw,52px)] font-extrabold leading-tight tracking-[-0.03em] text-ink">
          {member?.name || "회원"} <span className="text-sub">님</span>
        </h1>
        <p className="mt-2 max-w-[42ch] text-[clamp(14px,1.8vw,19px)] leading-relaxed text-sub">{sb.cover?.subtitle}</p>
      </div>
      <div className="sb-stg flex items-center gap-3 rounded-2xl border border-line bg-elevate px-4 py-3" style={{ "--sb-i": 2 }}>
        <BrandMark className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">{tr.display_name || "담당 트레이너"}</div>
          {tr.credentials && <div className="truncate text-[12px] text-muted">{tr.credentials}</div>}
        </div>
      </div>
    </div>
  );

  // ② 그동안의 여정
  slides.push(
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="그동안의 여정" className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className="sb-stg" style={{ "--sb-i": 1 }}>
        <h1 className="text-[clamp(22px,3.6vw,36px)] font-extrabold leading-tight tracking-[-0.02em] text-ink">{sb.journey?.headline}</h1>
        {sb.journey?.sub && <p className="mt-2 max-w-[52ch] text-[clamp(13px,1.6vw,17px)] leading-relaxed text-sub">{sb.journey.sub}</p>}
      </div>
      <div className="sb-stg mt-4 grid flex-1 grid-cols-2 content-center gap-3 sm:grid-cols-4" style={{ "--sb-i": 2 }}>
        <StatTile label="함께한 기간" val={j.months} unit="개월" />
        <StatTile label="완료 수업" val={j.sessions_done} unit="회" />
        <StatTile label="주 평균" val={j.weekly_frequency} unit="회" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/25 bg-primary-soft px-3 py-4 text-center">
          <div className="font-mono text-[clamp(22px,4vw,34px)] font-extrabold text-primary-strong">
            {j.remaining_paid ?? "—"}{j.remaining_paid != null ? <span className="ml-0.5 text-[13px] font-semibold text-muted">회</span> : null}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-sub">남은 수업{j.remaining_service ? ` (+${j.remaining_service} 서비스)` : ""}</div>
        </div>
      </div>
    </div>
  );

  // ③ 비포애프터 표(★핵심 · 데이터 렌더)
  slides.push(
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="숫자로 확인된 변화" className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className="sb-stg" style={{ "--sb-i": 1 }}>
        {sb.change?.title && <h1 className="text-[clamp(20px,3.2vw,32px)] font-extrabold leading-tight text-ink">{sb.change.title}</h1>}
        {sb.change?.sub && <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{sb.change.sub}</p>}
      </div>
      <div className="sb-stg flex-1" style={{ "--sb-i": 2 }}>
        {hasChange ? (
          <table className="mt-4 w-full border-collapse text-right tabular-nums">
            <thead><tr className="text-[11px] text-muted">
              <th className="border-b border-line px-2.5 py-1.5 text-left font-semibold">지표</th>
              <th className="border-b border-line px-2.5 py-1.5 font-semibold">처음</th>
              <th className="border-b border-line px-2.5 py-1.5 font-semibold">지금</th>
              <th className="border-b border-line px-2.5 py-1.5 font-semibold">변화</th>
            </tr></thead>
            <tbody>
              {inbody.length > 0 && <tr><td colSpan={4} className="px-2.5 pt-3 pb-1 text-left text-[10px] font-bold tracking-wide text-muted">체성분 · 인바디</td></tr>}
              {inbody.map((r) => (
                <tr key={r.key}>
                  <td className="border-b border-line px-2.5 py-2 text-left text-sm font-semibold text-ink">{r.label}</td>
                  <td className="border-b border-line px-2.5 py-2 text-sm text-sub">{r.first ?? "–"}<span className="ml-0.5 text-[11px] text-muted">{r.unit}</span></td>
                  <td className="border-b border-line px-2.5 py-2 text-sm text-ink">{r.latest ?? "–"}<span className="ml-0.5 text-[11px] text-muted">{r.unit}</span></td>
                  <td className={`border-b border-line px-2.5 py-2 text-sm font-extrabold ${deltaCls(r)}`}>{r.first != null && r.latest != null ? fmtD(r) : "–"}</td>
                </tr>
              ))}
              {exercises.length > 0 && <tr><td colSpan={4} className="px-2.5 pt-3 pb-1 text-left text-[10px] font-bold tracking-wide text-muted">근력 · 대표 종목 무게</td></tr>}
              {exercises.map((e) => (
                <tr key={e.exercise}>
                  <td className="border-b border-line px-2.5 py-2 text-left text-sm font-semibold text-ink">{e.exercise}</td>
                  <td className="border-b border-line px-2.5 py-2 text-sm text-sub">{e.first ?? "–"}<span className="ml-0.5 text-[11px] text-muted">kg</span></td>
                  <td className="border-b border-line px-2.5 py-2 text-sm text-ink">{e.latest ?? "–"}<span className="ml-0.5 text-[11px] text-muted">kg</span></td>
                  <td className="border-b border-line px-2.5 py-2 text-sm font-extrabold text-cyan-700">{e.first != null && e.latest != null ? (e.latest - e.first > 0 ? "+" : "") + (e.latest - e.first) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-elevate p-5 text-center text-[13px] leading-relaxed text-muted">
            아직 인바디·무게 기록이 쌓이는 중이에요. 다음 수업부터 하나씩 남기면 이 자리에 변화가 숫자로 채워집니다.
          </div>
        )}
        {sb.change?.caption && <div className="mt-3 rounded-xl border border-primary/25 bg-primary-soft px-4 py-3 text-[13px] leading-relaxed text-ink">{sb.change.caption}</div>}
      </div>
    </div>
  );

  // ④ 사진(있을 때만)
  if (hasPhotos) {
    slides.push(
      <div className="flex h-full flex-col">
        <SlideHead eyebrow={sb.photo?.title || "사진 기록"} className="sb-stg" style={{ "--sb-i": 0 }} />
        {sb.photo?.body && <p className="sb-stg mb-3 max-w-[52ch] text-[13px] leading-relaxed text-sub" style={{ "--sb-i": 1 }}>{sb.photo.body}</p>}
        <div className="sb-stg grid grid-cols-2 gap-3" style={{ "--sb-i": 2 }}>
          {[{ cap: "처음", row: before }, { cap: "지금", row: after }].map((ph, i) => (
            <figure key={i} className="overflow-hidden rounded-2xl border border-line bg-elevate">
              <div className="sb-photo flex items-center justify-center bg-bg">
                {ph.row && urls[ph.row.storage_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[ph.row.storage_path]} alt={ph.cap} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted"><Camera className="h-6 w-6" /><span className="text-[11px]">준비 중</span></div>
                )}
              </div>
              <figcaption className="px-3 py-2 text-[12px] font-semibold text-sub">{ph.cap}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  // ⑤ 단계 로드맵(★다 됐다 방지)
  slides.push(
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="지금 어디까지 · 앞으로" className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.slice(0, 4).map((s, i) => {
          const done = i + 1 < curStep, here = i + 1 === curStep;
          return (
            <div key={i} className={`sb-stg relative flex flex-col rounded-2xl border p-4 ${here ? "border-primary bg-primary-soft" : done ? "border-line bg-elevate opacity-70" : "border-dashed border-line-strong bg-elevate"}`} style={{ "--sb-i": i + 1 }}>
              {here && <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">지금 여기</span>}
              <div className="text-[11px] font-bold text-muted">STEP {i + 1}{done ? " ✓" : ""}</div>
              <div className="mt-0.5 text-[15px] font-bold text-ink">{s.title}</div>
              {s.desc && <p className="mt-2 text-[12px] leading-relaxed text-sub">{s.desc}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ⑥ 멈추면 / 이어가면
  slides.push(
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="지금 멈추면 · 이어가면" className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <div className="sb-stg flex flex-col rounded-2xl border border-line bg-elevate p-4" style={{ "--sb-i": 1 }}>
          <div className="mb-2 text-[12px] font-bold text-sub">여기서 멈추면</div>
          <ul className="space-y-2">
            {(Array.isArray(sb.fork?.stop) ? sb.fork.stop : []).map((t, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-ink"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="sb-stg flex flex-col rounded-2xl border border-primary/30 bg-primary-soft p-4" style={{ "--sb-i": 2 }}>
          <div className="mb-2 text-[12px] font-bold text-primary-strong">이어가면</div>
          <ul className="space-y-2">
            {(Array.isArray(sb.fork?.go) ? sb.fork.go : []).map((t, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-ink"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  // ⑦ 추천 플랜(SalesbookView plans 미러 · 금액은 packages[ref].price)
  slides.push(
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="추천 플랜" className="sb-stg" style={{ "--sb-i": 0 }} />
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        {plans.map((plan, i) => {
          const pkg = resolvePackage(i, plan, recommendedProgram, packages);
          const per = pkg && pkg.sessions ? Math.round(pkg.price / pkg.sessions) : null;
          const rec = plan.recommended;
          return (
            <div key={i} className={`sb-stg relative flex flex-col rounded-2xl border p-4 ${rec ? "border-primary bg-primary-soft" : "border-line bg-elevate"}`} style={{ "--sb-i": i + 1 }}>
              {rec && <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">추천</span>}
              <div className="text-[17px] font-extrabold text-ink">{plan.name}</div>
              <div className="mt-0.5 text-[12px] text-muted">{plan.meta}{plan.sessions_label ? ` · ${plan.sessions_label}` : ""}</div>
              {pkg && (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-[clamp(24px,3.2vw,32px)] font-extrabold text-primary-strong">{won(pkg.price)}</span>
                  {per != null && <span className="text-[11px] text-muted">회당 {won(per)}</span>}
                </div>
              )}
              {plan.why && <p className="mt-2 text-[12px] leading-relaxed text-sub">{plan.why}</p>}
              {Array.isArray(plan.includes) && (
                <ul className="mt-auto space-y-1 pt-3">
                  {plan.includes.map((it, jx) => (
                    <li key={jx} className="flex items-start gap-1.5 text-[12px] text-ink"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />{it}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ⑧ 클로징 / 약속(SalesbookView closing 미러 · vow 손글씨)
  slides.push(
    <div className="flex h-full flex-col">
      <SlideHead eyebrow="약속드릴게요" className="sb-stg" style={{ "--sb-i": 0 }} />
      {Array.isArray(sb.closing?.services) && (
        <div className="sb-stg grid grid-cols-2 gap-2.5" style={{ "--sb-i": 1 }}>
          {sb.closing.services.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-elevate px-3 py-2.5 text-[12px] text-ink">
              <Check className="h-3.5 w-3.5 shrink-0 text-primary-strong" /><span>{s}</span>
            </div>
          ))}
        </div>
      )}
      <div className="sb-stg mt-3 flex flex-1 flex-col rounded-2xl border border-primary/25 bg-primary-soft p-5" style={{ "--sb-i": 2 }}>
        <p className="sb-handwriting flex flex-1 items-center text-[clamp(22px,3.4vw,34px)] leading-snug text-ink">{sb.closing?.vow}</p>
        <div className="mt-3 flex items-end justify-end gap-3">
          <span className="text-[12px] text-muted">{tr.display_name || "담당 트레이너"}</span>
          {tr.signature_data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tr.signature_data_url} alt="서명" className="h-12 max-w-[160px] object-contain" />
          ) : (
            <span className="sb-handwriting text-[22px] text-ink/70">{tr.display_name || ""}</span>
          )}
        </div>
      </div>
    </div>
  );

  const total = slides.length;

  const go = useCallback((n) => setIdx(() => Math.max(0, Math.min(total - 1, n))), [total]);
  const step = useCallback((d) => setIdx((p) => Math.max(0, Math.min(total - 1, p + d))), [total]);

  // 좌우 키 네비 + Esc(전체화면 중엔 브라우저가 먼저 소비).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") { if (document.fullscreenElement) return; onClose?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  // 스와이프.
  const [touchX, setTouchX] = useState(null);
  const onTouchStart = (e) => setTouchX(e.touches[0]?.clientX ?? null);
  const onTouchEnd = (e) => {
    if (touchX == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    setTouchX(null);
  };

  return (
    <div ref={sbRootRef} className={`sb-root fixed inset-0 z-[120] flex flex-col bg-[rgb(19_21_27/0.82)] backdrop-blur-sm ${presentMode ? "sb-present" : ""}`} role="dialog" aria-modal="true" aria-label="재등록 세일즈북">
      <SalesbookStyle />

      {/* 발표 모드 종료 — .sb-chrome 밖이라 발표 모드에서도 항상 나가기 가능(인쇄엔 숨김). */}
      {presentMode && (
        <button
          onClick={() => setPresentMode(false)}
          aria-label="발표 모드 종료"
          aria-pressed={true}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/60 print:hidden"
        >
          <X className="h-3.5 w-3.5" /> 발표 모드 종료
        </button>
      )}

      {/* 상단 바 — present 컨트롤(인쇄엔 숨김). */}
      <div className="sb-chrome flex items-center justify-between px-4 py-2.5">
        <span className="text-[12px] font-semibold text-white/80">
          {member?.name ? `${member.name} 님 변화 리포트` : "재등록 세일즈북"}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/25">
            <Printer className="h-3.5 w-3.5" /> PDF·인쇄
          </button>
          <button onClick={() => setPresentMode(true)} aria-label="발표 모드" aria-pressed={presentMode} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/25">
            <Presentation className="h-3.5 w-3.5" /> 발표 모드
          </button>
          {fsEnabled && (
            <button onClick={toggleFs} aria-label={isFs ? "전체화면 종료" : "전체화면"} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/25">
              {isFs ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
              {isFs ? "종료" : "전체화면"}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} aria-label="닫기" className="rounded-lg bg-white/15 p-1.5 text-white transition hover:bg-white/25">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 무대 — 16:9 캐러셀(가로) / 스택(세로·인쇄) */}
      <div className="sb-viewport flex-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="sb-stage">
          <div className="sb-track" style={{ "--sb-tx": `${-idx * 100}%` }}>
            {slides.map((node, i) => (
              <Slide key={i} n={i + 1} total={total} idx={idx} className={i === 0 ? "sb-cover" : ""}>{node}</Slide>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 네비 — 점 + 화살표(인쇄엔 숨김) */}
      <div className="sb-chrome flex items-center justify-center gap-4 px-4 py-3">
        <button onClick={() => step(-1)} disabled={idx === 0} aria-label="이전" className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <button key={i} onClick={() => go(i)} aria-label={`${i + 1}번 슬라이드`} className={`h-2 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-2 bg-white/40"}`} />
          ))}
        </div>
        <button onClick={() => step(1)} disabled={idx === total - 1} aria-label="다음" className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* 스타일 — SalesbookView와 동일한 .sb-* 스코프(이식). SLIDE_COUNT 무관. */
function SalesbookStyle() {
  return (
    <style>{`
.sb-viewport { display:flex; align-items:center; justify-content:center; overflow:hidden; padding:12px; }
.sb-stage { width:100%; max-width:min(1180px, 96vw, calc((100dvh - var(--sb-chrome,130px)) * 16 / 9)); }
.sb-track { display:flex; transform:translateX(var(--sb-tx,0)); transition:transform .32s cubic-bezier(.22,.9,.28,1); }
.sb-slide { flex:0 0 100%; word-break:keep-all; }
.sb-slide-inner { position:relative; aspect-ratio:16/9; overflow:hidden; background:var(--color-card,#fff); border:1px solid var(--color-line,#e6e7eb); border-radius:16px; box-shadow:0 24px 48px -20px rgb(19 21 27/.5); }
.sb-pad { position:absolute; inset:0; padding:clamp(20px,3.4vw,40px); }
.sb-fit { transform-origin:top center; width:100%; min-height:100%; }
.sb-corner { position:absolute; right:14px; bottom:12px; display:flex; align-items:center; gap:6px; }
.sb-cover .sb-corner { display:none; }
.sb-photo { aspect-ratio:4/3; }
.sb-handwriting { font-family: var(--font-handwriting, "Nanum Pen Script"), "Gaegu", cursive; }

@keyframes sb-rise { from{opacity:0; transform:translateY(16px)} to{opacity:1; transform:translateY(0)} }
.sb-build { height:100%; }
.sb-build.sb-play .sb-stg {
  animation: sb-rise .5s cubic-bezier(.2,.7,.25,1) both;
  animation-delay: calc(var(--sb-i, 0) * .14s);
}

@media (prefers-reduced-motion: reduce){
  .sb-build > *, .sb-build .sb-stg { opacity:1 !important; transform:none !important; animation:none !important; }
}

.sb-present { --sb-chrome:24px; }
.sb-present .sb-chrome { display:none !important; }
.sb-present .sb-viewport { padding:6px; }

@media (max-width:820px), (orientation:portrait) {
  .sb-stage { max-width:min(96vw, calc((100dvh - var(--sb-chrome,130px)) * 9 / 16)); }
  .sb-slide-inner { aspect-ratio:9/16; }
  .sb-photo { aspect-ratio:3/4; }
}

@media print {
  body { background:#fff !important; }
  body * { visibility:hidden !important; }
  .sb-root, .sb-root * { visibility:visible !important; }
  .sb-root { position:absolute !important; inset:0 !important; background:#fff !important; backdrop-filter:none !important; display:block !important; }
  .sb-chrome { display:none !important; }
  @page { size:A4 landscape; margin:0; }
  .sb-viewport { overflow:visible !important; padding:0 !important; display:block !important; }
  .sb-stage { max-width:none !important; width:100% !important; }
  .sb-track { display:block !important; transform:none !important; }
  .sb-fit { transform:none !important; height:100% !important; }
  .sb-build > *, .sb-build .sb-stg { opacity:1 !important; transform:none !important; animation:none !important; }
  .sb-slide { margin:0 !important; }
  .sb-slide-inner { aspect-ratio:auto !important; height:100vh !important; overflow:hidden !important; border:none !important; border-radius:0 !important; box-shadow:none !important; page-break-after:always; break-after:page; }
  .sb-photo { aspect-ratio:4/3 !important; }
}
`}</style>
  );
}

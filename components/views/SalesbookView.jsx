"use client";
/* =========================================================================
   SalesbookView — 2차 OT 회원 대면 세일즈북 렌더(7슬라이드). 스펙 §5.
   ★독자 = 회원 본인. 트레이너 컨닝페이퍼(브리핑)와 별개 · 정성/사람 손길이 핵심.

   레이아웃: 가로 16:9 기본(캐러셀), 세로/좁은 폭이면 스택 카드로 CSS 전환(같은 JSON).
     - transform은 CSS var(--sb-tx)로만 걸어 미디어쿼리가 override 가능(인라인 transform 금지).
   가격: AI JSON엔 금액 없음 → 앱이 packages[ref].price 렌더. ⚠️ref는 모델을 안 믿고
     recommendedProgram.pick_ref/alt_ref 우선 + 유효 인덱스 검증(스펙 #2).
   사진: member_photo 서명URL(createSignedUrls · MemberPhotoSummary 패턴). 없으면 플레이스홀더.
   손글씨(vow): --font-handwriting(self-host woff2 배선 후) · 미배선 시 cursive 폴백.
   PDF: window.print() + @media print(A4 가로). present(editable=false)=회원에게 보이는 화면.
   ========================================================================= */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, X, Check, Camera, Search, ArrowRight, Target, Maximize, Minimize } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import BrandMark from "@/components/ui/BrandMark";
import Wordmark from "@/components/ui/Wordmark";

const SLIDE_COUNT = 7;

// ── 가격 해석(#2) — 모델 plan.ref를 안 믿는다. A=pick_ref, B=alt_ref 우선, 유효성 검증. ──
function resolvePackage(planIndex, plan, recommendedProgram, packages) {
  const list = Array.isArray(packages) ? packages : [];
  const rp = recommendedProgram || {};
  const valid = (n) => Number.isInteger(n) && n >= 0 && n < list.length;
  // 1순위: recommendedProgram의 확정 ref. 2순위(alt가 null 등): 모델이 고른 ref(검증 후).
  let ref = planIndex === 0 ? rp.pick_ref : rp.alt_ref;
  if (!valid(ref)) ref = plan?.ref;
  return valid(ref) ? list[ref] : null;
}

// ── 사진 해석 — mode별로 보여줄 2컷 선정. rows=member_photo(taken_on desc), urls=path→signedUrl. ──
function pickPhotos(mode, rows, urls) {
  const withUrl = (rows || []).filter((r) => urls[r.storage_path]);
  const latestOf = (label) => withUrl.find((r) => r.label === label) || null;
  if (mode === "within_session") {
    const before = latestOf("before");
    const after = latestOf("after") || latestOf("progress");
    return [
      { cap: "처음", row: before },
      { cap: "잡아드린 뒤", row: after },
    ];
  }
  // baseline — 최근 2컷(시작점 기준).
  return [
    { cap: "정면", row: withUrl[0] || null },
    { cap: "측/후면", row: withUrl[1] || null },
  ];
}

/* 콘텐츠를 프레임에 맞게 자동 축소(fit-to-scale) — 고정 16:9/9:16에 내용이 넘치면 잘리는 대신 scale 다운.
   transform은 scrollHeight에 영향 없어 재측정 루프가 안 생김. 리사이즈+편집(콘텐츠 높이 변화) 둘 다 refit. */
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
    window.addEventListener("resize", fit);   // 방향전환 등 뷰포트 변화 백업(RO가 못 잡는 케이스 대비)
    fit();
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return ref;
}

/* ── 슬라이드 셸 — 프레임(overflow:hidden) · 패딩(.sb-pad) · fit 래퍼(.sb-fit) · 코너 마크. ── */
function Slide({ n, children, className = "" }) {
  const fitRef = useFitScale();
  return (
    <section className={`sb-slide ${className}`}>
      <div className="sb-slide-inner">
        <div className="sb-pad"><div ref={fitRef} className="sb-fit">{children}</div></div>
        <div className="sb-corner">
          <BrandMark className="h-4 w-4" />
          <span className="text-[10px] font-semibold tracking-[0.02em] text-muted">{n} / {SLIDE_COUNT}</span>
        </div>
      </div>
    </section>
  );
}

function Tag({ children }) {
  return <span className="rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary-strong">{children}</span>;
}

/* 인라인 편집 필드 — editable이면 input/textarea, 아니면 children(present 표시)을 그대로. */
function EditField({ editable, value, onChange, multiline = false, placeholder = "", children }) {
  if (!editable) return children;
  const cls = "w-full rounded-lg border border-primary/40 bg-card px-2.5 py-1.5 text-[13px] leading-relaxed text-ink outline-none focus:border-primary";
  return multiline
    ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder} className={cls} />
    : <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />;
}

export default function SalesbookView({
  salesbook,
  member,
  trainer,
  packages = [],
  recommendedProgram = null,
  editable = false, // present(false)=회원 대면(깨끗) · true=트레이너 인라인 편집
  onSave,
  onClose,
}) {
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState([]);
  const [urls, setUrls] = useState({});
  // 전체화면 — sb-root를 Fullscreen API로. 전체화면이면 100dvh=화면 전체라 stage 높이 캡이 더 큰 프레임 → 시원한 제시.
  const sbRootRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const fsEnabled = typeof document !== "undefined" && document.fullscreenEnabled; // 아이폰 Safari=false → 버튼 숨김
  useEffect(() => {
    const on = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else sbRootRef.current?.requestFullscreen?.();
  };
  // 편집 드래프트 — editable일 때만 이걸로 렌더/수정.
  const [draft, setDraft] = useState(() => salesbook || {});
  const [saving, setSaving] = useState(false);
  // salesbook이 바뀌면(재생성 등) 드래프트 리셋 — effect 대신 '렌더 중 조정'(React 권장 · set-state-in-effect 회피).
  const [prevSb, setPrevSb] = useState(salesbook);
  if (salesbook !== prevSb) { setPrevSb(salesbook); setDraft(salesbook || {}); }
  const sb = editable ? draft : (salesbook || {});
  // 중첩 필드 편집기(editable일 때만 소비). 예: setField("confirmed", "vow"…) 는 slice별로 아래에서.
  const setConfirmed = (k, v) => setDraft((d) => ({ ...d, confirmed: { ...(d.confirmed || {}), [k]: v } }));
  const setClosing = (k, v) => setDraft((d) => ({ ...d, closing: { ...(d.closing || {}), [k]: v } }));
  const setService = (i, v) => setDraft((d) => {
    const arr = Array.isArray(d.closing?.services) ? [...d.closing.services] : [];
    arr[i] = v;
    return { ...d, closing: { ...(d.closing || {}), services: arr } };
  });
  const doSave = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try { const ok = await onSave(draft); if (ok) onClose?.(); }
    finally { setSaving(false); }
  };

  const go = useCallback((n) => setIdx(() => Math.max(0, Math.min(SLIDE_COUNT - 1, n))), []);      // 절대 이동(점 클릭)
  const step = useCallback((d) => setIdx((p) => Math.max(0, Math.min(SLIDE_COUNT - 1, p + d))), []); // 상대 이동(화살표·키·스와이프 · 함수형이라 stale idx 없음)

  // 회원 사진 로드(서명 URL) — 데모/무회원이면 스킵(플레이스홀더 렌더).
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

  // 좌우 키 네비(present).
  useEffect(() => {
    const onKey = (e) => {
      // 편집 입력 중이면 좌우/ESC가 커서·필드 조작이라 슬라이드 네비/닫기 가로채지 않음.
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      // Esc 이중동작 방지 — 전체화면 중엔 브라우저가 Esc로 전체화면만 종료(닫기는 다음 Esc).
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

  const photos = useMemo(() => pickPhotos(sb.photo_slide?.mode, rows, urls), [sb.photo_slide?.mode, rows, urls]);

  const tr = trainer || {};
  const plans = Array.isArray(sb.plans) ? sb.plans.slice(0, 2) : [];

  return (
    <div ref={sbRootRef} className="sb-root fixed inset-0 z-[120] flex flex-col bg-[rgb(19_21_27/0.82)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="회원 세일즈북">
      <SalesbookStyle />

      {/* 상단 바 — present 컨트롤(인쇄엔 숨김). editable이면 '저장' 노출. */}
      <div className="sb-chrome flex items-center justify-between px-4 py-2.5">
        <span className="text-[12px] font-semibold text-white/80">
          {editable ? "세일즈북 편집" : (member?.name ? `${member.name} 님 자료` : "세일즈북")}
        </span>
        <div className="flex items-center gap-2">
          {editable ? (
            <button onClick={doSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-primary-strong transition hover:bg-white/90 disabled:opacity-60">
              {saving ? "저장 중…" : "저장"}
            </button>
          ) : (
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/25">
              <Printer className="h-3.5 w-3.5" /> PDF·인쇄
            </button>
          )}
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
            {/* ① 표지 — fit 래퍼는 자연 높이라 justify-between 대신 상단정렬 스택(간격으로 여백). */}
            <Slide n={1} className="sb-cover">
              <div className="flex flex-col gap-6 sm:gap-8">
                <Wordmark className="text-[15px] font-extrabold" />
                <div>
                  <p className="text-[13px] font-semibold text-primary-strong">TRAINING PLAN</p>
                  <h1 className="mt-1 text-[clamp(28px,5vw,52px)] font-extrabold leading-tight tracking-[-0.03em] text-ink">
                    {member?.name || "회원"} <span className="text-sub">님</span>
                  </h1>
                  <p className="mt-2 max-w-[42ch] text-[clamp(14px,1.8vw,19px)] leading-relaxed text-sub">{sb.cover?.subtitle}</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevate px-4 py-3">
                  <BrandMark className="h-9 w-9 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-ink">{tr.display_name || "담당 트레이너"}</div>
                    {tr.credentials && <div className="truncate text-[12px] text-muted">{tr.credentials}</div>}
                  </div>
                </div>
              </div>
            </Slide>

            {/* ② 목표 — 큰 목표 카드로 채움 + 지금 겪는 것. */}
            <Slide n={2}>
              <div className="flex h-full flex-col">
                <SlideHead eyebrow="당신의 목표" />
                <div className="flex flex-1 flex-col justify-center rounded-2xl border border-primary/25 bg-primary-soft p-5">
                  <Target className="h-7 w-7 text-primary-strong" />
                  <h2 className="mt-2 text-[clamp(22px,3.6vw,38px)] font-extrabold leading-tight tracking-[-0.02em] text-ink">{sb.goal?.headline}</h2>
                  <p className="mt-3 max-w-[52ch] text-[clamp(13px,1.6vw,17px)] leading-relaxed text-sub">{sb.goal?.body}</p>
                </div>
                {Array.isArray(sb.goal?.current_issues) && sb.goal.current_issues.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-[12px] font-semibold text-muted">지금 겪고 계신 것</p>
                    <div className="flex flex-wrap gap-2">{sb.goal.current_issues.map((t, i) => <Tag key={i}>{t}</Tag>)}</div>
                  </div>
                )}
              </div>
            </Slide>

            {/* ③ 오늘 확인한 것 — ★트레이너 전문가 시선(원인·접근)이 주인공. before/after는 작은 근거. */}
            <Slide n={3}>
              {(() => {
                const cf = sb.confirmed || {};
                // 옛 캐시 폴백: diagnosis/approach 없고 bridge만 있으면 bridge를 '원인' 박스에 표시(graceful).
                const diagText = cf.diagnosis || (!cf.approach ? cf.bridge : "") || "";
                return (
                  <div className="flex h-full flex-col">
                    <SlideHead eyebrow="오늘 함께 확인한 것" />
                    {/* 상단 — before/after 작은 근거 2칸 */}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="rounded-xl border border-line bg-elevate px-3 py-2">
                        <div className="text-[10px] font-bold text-muted">오늘 처음</div>
                        <EditField editable={editable} value={cf.before} onChange={(v) => setConfirmed("before", v)} multiline placeholder="처음 상태">
                          <p className="mt-0.5 text-[12px] leading-relaxed text-sub">{cf.before}</p>
                        </EditField>
                      </div>
                      <div className="rounded-xl border border-primary/25 bg-primary-soft px-3 py-2">
                        <div className="text-[10px] font-bold text-primary-strong">자세 하나 잡아드린 뒤</div>
                        <EditField editable={editable} value={cf.after} onChange={(v) => setConfirmed("after", v)} multiline placeholder="잡아드린 뒤">
                          <p className="mt-0.5 text-[12px] leading-relaxed text-ink">{cf.after}</p>
                        </EditField>
                      </div>
                    </div>
                    {/* 중앙 — 제가 본 원인(흰) + 그래서 이렇게(빨강). 크게, 세로 채움. */}
                    <div className="mt-3 flex flex-1 flex-col justify-center gap-3">
                      {(editable || diagText) && (
                        <div className="rounded-2xl border border-line bg-card p-4">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-sub">
                            <Search className="h-3.5 w-3.5 text-primary-strong" /> 제가 본 원인
                          </div>
                          <EditField editable={editable} value={cf.diagnosis} onChange={(v) => setConfirmed("diagnosis", v)} multiline placeholder="제가 보니 원인은 ~">
                            <p className="text-[clamp(14px,1.9vw,18px)] font-semibold leading-snug text-ink">{diagText}</p>
                          </EditField>
                        </div>
                      )}
                      {(editable || cf.approach) && (
                        <div className="rounded-2xl border border-primary bg-primary-soft p-4">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-primary-strong">
                            <ArrowRight className="h-3.5 w-3.5" /> 그래서 이렇게 바꿔드려요
                          </div>
                          <EditField editable={editable} value={cf.approach} onChange={(v) => setConfirmed("approach", v)} multiline placeholder="닫힌 흉곽부터 열고 → 등 감각 심고 → 어깨 라인 올리는 순서로 잡아드려요">
                            <p className="text-[clamp(14px,1.9vw,18px)] font-semibold leading-snug text-ink">{cf.approach}</p>
                          </EditField>
                        </div>
                      )}
                    </div>
                    {/* 하단 — 회원 한마디 작은 보조 */}
                    {editable ? (
                      <div className="mt-2">
                        <div className="mb-1 text-[10px] font-bold text-muted">회원 한마디 (보조 · 선택)</div>
                        <EditField editable value={cf.member_quote} onChange={(v) => setConfirmed("member_quote", v)} placeholder="회원이 한 말 그대로">{null}</EditField>
                      </div>
                    ) : cf.member_quote ? (
                      <p className="mt-2 text-[12px] italic leading-snug text-muted">회원 한마디 — &ldquo;{cf.member_quote}&rdquo;</p>
                    ) : null}
                  </div>
                );
              })()}
            </Slide>

            {/* ④ 사진 */}
            <Slide n={4}>
              <SlideHead eyebrow={sb.photo_slide?.title || "사진 기록"} />
              {sb.photo_slide?.body && <p className="mb-3 max-w-[52ch] text-[13px] leading-relaxed text-sub">{sb.photo_slide.body}</p>}
              <div className="grid grid-cols-2 gap-3">
                {photos.map((ph, i) => (
                  <figure key={i} className="overflow-hidden rounded-2xl border border-line bg-elevate">
                    <div className="sb-photo flex items-center justify-center bg-bg">
                      {ph.row && urls[ph.row.storage_path] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[ph.row.storage_path]} alt={ph.cap} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-muted">
                          <Camera className="h-6 w-6" />
                          <span className="text-[11px]">다음에 함께 남겨요</span>
                        </div>
                      )}
                    </div>
                    <figcaption className="px-3 py-2 text-[12px] font-semibold text-sub">{ph.cap}</figcaption>
                  </figure>
                ))}
              </div>
              {Array.isArray(sb.photo_slide?.points) && (
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {sb.photo_slide.points.map((p, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[12px] text-sub"><Check className="h-3.5 w-3.5 text-primary-strong" />{p}</li>
                  ))}
                </ul>
              )}
            </Slide>

            {/* ⑤ 로드맵 + 현재 — 각 단계 '제 방법(how)' + '느낄 변화(feel)'. 카드 full-height 채움. */}
            <Slide n={5}>
              <div className="flex h-full flex-col">
                <SlideHead eyebrow="여기까지 함께 갑니다" />
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                  {(Array.isArray(sb.roadmap?.steps) ? sb.roadmap.steps.slice(0, 3) : []).map((s, i) => {
                    const here = (sb.roadmap?.current_step ?? 1) === i + 1;
                    const how = s.how || s.desc || ""; // 옛 캐시 폴백(desc)
                    return (
                      <div key={i} className={`relative flex flex-col rounded-2xl border p-4 ${here ? "border-primary/40 bg-primary-soft" : "border-line bg-elevate"}`}>
                        {here && <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">지금 여기</span>}
                        <div className="text-[11px] font-bold text-muted">STEP {i + 1}</div>
                        <div className="mt-0.5 text-[15px] font-bold text-ink">{s.title}</div>
                        {how && (
                          <p className="mt-2 text-[12px] leading-relaxed text-sub">
                            <span className="font-semibold text-ink">제 방법 · </span>{how}
                          </p>
                        )}
                        {s.feel && <p className="mt-auto pt-2 text-[12px] font-semibold text-primary-strong">{s.feel}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Slide>

            {/* ⑥ 추천 플랜 — 카드 full-height · 가격 대형. */}
            <Slide n={6}>
              <div className="flex h-full flex-col">
                <SlideHead eyebrow="추천 플랜" />
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  {plans.map((plan, i) => {
                    const pkg = resolvePackage(i, plan, recommendedProgram, packages);
                    const per = pkg && pkg.sessions ? Math.round(pkg.price / pkg.sessions) : null;
                    const rec = plan.recommended;
                    return (
                      <div key={i} className={`relative flex flex-col rounded-2xl border p-4 ${rec ? "border-primary bg-primary-soft" : "border-line bg-elevate"}`}>
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
                            {plan.includes.map((it, j) => (
                              <li key={j} className="flex items-start gap-1.5 text-[12px] text-ink"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />{it}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Slide>

            {/* ⑦ 마무리 — 서비스 2×2 + 손글씨 다짐 넉넉하게 채움. */}
            <Slide n={7}>
              <div className="flex h-full flex-col">
                <SlideHead eyebrow="약속드릴게요" />
                {Array.isArray(sb.closing?.services) && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {sb.closing.services.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-elevate px-3 py-2.5 text-[12px] text-ink">
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
                        <EditField editable={editable} value={s} onChange={(v) => setService(i, v)} placeholder={`서비스 ${i + 1}`}>
                          <span>{s}</span>
                        </EditField>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-1 flex-col rounded-2xl border border-primary/25 bg-primary-soft p-5">
                  {editable ? (
                    <textarea
                      value={sb.closing?.vow || ""}
                      onChange={(e) => setClosing("vow", e.target.value)}
                      rows={3}
                      placeholder="회원에게 남길 다짐 (판매 권유 아닌 책임의 약속)"
                      className="sb-handwriting flex-1 w-full rounded-lg border border-primary/40 bg-card px-3 py-2 text-[clamp(22px,3.4vw,34px)] leading-snug text-ink outline-none focus:border-primary"
                    />
                  ) : (
                    <p className="sb-handwriting flex flex-1 items-center text-[clamp(22px,3.4vw,34px)] leading-snug text-ink">{sb.closing?.vow}</p>
                  )}
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
            </Slide>
          </div>
        </div>
      </div>

      {/* 하단 네비 — 점 + 화살표(인쇄엔 숨김) */}
      <div className="sb-chrome flex items-center justify-center gap-4 px-4 py-3">
        <button onClick={() => step(-1)} disabled={idx === 0} aria-label="이전" className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <button key={i} onClick={() => go(i)} aria-label={`${i + 1}번 슬라이드`} className={`h-2 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-2 bg-white/40"}`} />
          ))}
        </div>
        <button onClick={() => step(1)} disabled={idx === SLIDE_COUNT - 1} aria-label="다음" className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* 슬라이드 상단 라벨 — 얇은 빨강 바 + 텍스트. */
function SlideHead({ eyebrow }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1 rounded-full bg-primary" />
      <span className="text-[12px] font-bold tracking-[0.02em] text-primary-strong">{eyebrow}</span>
    </div>
  );
}

/* 스타일 — .sb-* 스코프. 캐러셀 transform은 CSS var라 미디어쿼리가 override 가능.
   손글씨: --font-handwriting(self-host 배선 후) 없으면 cursive 폴백. 인쇄: A4 가로 · sb-root만 보이게. */
function SalesbookStyle() {
  return (
    <style>{`
.sb-viewport { display:flex; align-items:center; justify-content:center; overflow:hidden; padding:12px; }
/* 폭 캡 + 높이 캡 — 넓고 짧은 뷰포트에서 16:9 프레임이 뷰포트 높이를 넘어 위아래 잘리던 것 방지.
   130px = 상단 바(≈44) + 하단 네비(≈56) + 뷰포트 패딩(≈24). 전체화면이면 100dvh=화면 전체라 더 큰 프레임. */
.sb-stage { width:100%; max-width:min(1180px, 96vw, calc((100dvh - 130px) * 16 / 9)); }
.sb-track { display:flex; transform:translateX(var(--sb-tx,0)); transition:transform .32s cubic-bezier(.22,.9,.28,1); }
.sb-slide { flex:0 0 100%; }
/* 프레임은 고정 16:9 · overflow:hidden. 콘텐츠는 .sb-pad>.sb-fit로 감싸고 useFitScale이 넘치면 scale 다운. */
.sb-slide-inner { position:relative; aspect-ratio:16/9; overflow:hidden; background:var(--color-card,#fff); border:1px solid var(--color-line,#e6e7eb); border-radius:16px; box-shadow:0 24px 48px -20px rgb(19 21 27/.5); }
.sb-pad { position:absolute; inset:0; padding:clamp(20px,3.4vw,40px); }
/* min-height:100% — 콘텐츠가 짧으면 프레임을 채우고(flex 분배 가능), 넘치면 useFitScale이 축소(안전망). */
.sb-fit { transform-origin:top center; width:100%; min-height:100%; }
.sb-corner { position:absolute; right:14px; bottom:12px; display:flex; align-items:center; gap:6px; }
.sb-cover .sb-corner { display:none; } /* 표지엔 트레이너 브랜드칩+Wordmark가 이미 있어 코너 마크는 중복 */
/* 가로(16:9 · 짧은 프레임)에선 4:3로 낮춰 2장이 들어가게. 세로 폰에선 아래 미디어쿼리로 3:4(자연). */
.sb-photo { aspect-ratio:4/3; }
.sb-handwriting { font-family: var(--font-handwriting, "Nanum Pen Script"), "Gaegu", cursive; }

/* 세로/좁은 폭 — 캐러셀 유지(한 장씩 스와이프) · 프레임만 9:16 톨. 프레임이 뷰포트 높이를 안 넘게 stage 폭 캡. */
@media (max-width:820px), (orientation:portrait) {
  .sb-stage { max-width:min(96vw, calc((100dvh - 130px) * 9 / 16)); }
  .sb-slide-inner { aspect-ratio:9/16; }
  .sb-photo { aspect-ratio:3/4; } /* 폰은 세로 여백 넉넉 → 인물 사진 세로비 유지 */
  .sb-nav-hint { display:none; }
}

/* 인쇄 — A4 가로 · sb-root만 · 슬라이드 페이지당 1장. transform(스크린 16:9 scale) 그대로 두면 A4(더 세로긴)에 여유롭게 들어감. */
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
  /* 화면 fit-scale의 인라인 transform 제거 + 확정 높이 부여 → 내부 flex(h-full·margin-top:auto)가 A4 한 장을 꽉 채움.
     ⚠️ min-height:100%만으론 높이 auto라 자식 height:100%가 무너져 세로가 안 채워짐 → height:100% 필수. */
  .sb-fit { transform:none !important; height:100% !important; }
  .sb-slide { margin:0 !important; }
  .sb-slide-inner { aspect-ratio:auto !important; height:100vh !important; overflow:hidden !important; border:none !important; border-radius:0 !important; box-shadow:none !important; page-break-after:always; break-after:page; }
  .sb-photo { aspect-ratio:4/3 !important; } /* 인쇄=가로 A4라 낮은 비율 유지 */
}
`}</style>
  );
}

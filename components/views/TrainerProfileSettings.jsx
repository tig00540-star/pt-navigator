"use client";
/* 회원 세일즈북 설정 — 표지 이름·자격 한 줄·서명 + 신규 등록 혜택 장(2026-10-02).
   trainer_profile(본인 1행 · upsert onConflict trainer_id). 구 '내 프로필'(성향·세일즈 스타일·MBTI·소개)은
   어디에도 쓰이지 않아 화면에서 뺐다 — 컬럼·저장값은 그대로 둔다(upsert는 보낸 칸만 바꾼다).
   혜택 장: 신규 등록(OT) 세일즈북에만 붙는다(재등록 세일즈북엔 안 붙음). 앞 목록은 회원 전용 페이지에
   실제로 있는 기능만 — 없는 기능을 약속하지 않는다. 그 밖의 혜택은 트레이너가 직접 적는다. */
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Gift, PenLine, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import Card from "@/components/ui/Card";
import { inputCls } from "@/components/ui/Field";

// 회원 전용 페이지에 실제로 있는 기능(app/m/[token]) — 새 기능이 생기면 여기에만 추가.
export const BENEFIT_PRESETS = [
  "회원 전용 페이지 — 운동일지·인바디·무게 변화를 폰으로 언제든",
  "수업마다 운동일지를 보내 드려요 (회원님이 직접 확인)",
  "오운완 출석 챌린지 — 꾸준히 오시면 포상",
  "비포애프터 사진·유산소·개인운동 기록 보관",
  "운동 달력으로 꾸준함을 한눈에",
];

export default function TrainerProfileSettings() {
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [signature, setSignature] = useState(""); // PNG data URL(""=없음)
  const [benefitsOn, setBenefitsOn] = useState(false);
  const [benefits, setBenefits] = useState([]); // 고른 혜택(프리셋 문구 + 직접 적은 것)
  const [custom, setCustom] = useState("");
  const [hasBenefitCol, setHasBenefitCol] = useState(true); // DB에 salesbook_benefits 칸이 있는지
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const painted = useRef(false); // 저장된 서명을 캔버스에 1회만 페인트
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      try {
        const { data: au } = await supabase.auth.getUser();
        const id = au?.user?.id ?? null;
        const { data } = await supabase.from("trainer_profile").select("*").eq("trainer_id", id).maybeSingle();
        if (cancelled) return;
        setUid(id);
        if (data) {
          setDisplayName(data.display_name ?? "");
          setCredentials(data.credentials ?? "");
          setSignature(data.signature_data_url ?? "");
          setHasBenefitCol("salesbook_benefits" in data);
          const sb = data.salesbook_benefits;
          if (sb && typeof sb === "object") {
            setBenefitsOn(Boolean(sb.enabled));
            setBenefits(Array.isArray(sb.items) ? sb.items.filter((x) => typeof x === "string") : []);
          }
        }
      } catch {
        /* 조회 실패 → 빈 폼 유지, 스피너만 해제 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 저장된 서명을 캔버스에 1회 페인트(로딩 완료 후 · 그린 뒤엔 재페인트 안 함 → 획마다 깜빡임 없음).
  useEffect(() => {
    if (loading || painted.current) return;
    painted.current = true;
    const c = canvasRef.current;
    if (signature && c) {
      const img = new Image();
      img.onload = () => { const cc = canvasRef.current; if (cc) cc.getContext("2d").drawImage(img, 0, 0, cc.width, cc.height); };
      img.src = signature;
    }
  }, [loading, signature]);

  // 서명 드로잉 — pointer 이벤트(마우스+터치 통합). 캔버스 내부 해상도 320×96 고정(data URL 비대화 방지).
  const posOf = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };
  const drawStart = (e) => { e.preventDefault(); drawing.current = true; last.current = posOf(e); canvasRef.current.setPointerCapture?.(e.pointerId); };
  const drawMove = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = posOf(e);
    ctx.strokeStyle = "#13151b"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const drawEnd = () => { if (!drawing.current) return; drawing.current = false; setSignature(canvasRef.current.toDataURL("image/png")); };
  const clearSig = () => { const c = canvasRef.current; c?.getContext("2d").clearRect(0, 0, c.width, c.height); setSignature(""); };

  const toggleBenefit = (t) => setBenefits((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    setBenefits((p) => (p.includes(t) || p.length >= 8 ? p : [...p, t]));
    setCustom("");
  };
  const customItems = benefits.filter((b) => !BENEFIT_PRESETS.includes(b));

  const save = async () => {
    if (saving) return;
    const payload = {
      trainer_id: uid,
      display_name: displayName.trim() || null,
      credentials: credentials.trim() || null,
      signature_data_url: signature || null,
      updated_at: new Date().toISOString(),
      ...(hasBenefitCol ? { salesbook_benefits: { enabled: benefitsOn, items: benefits } } : {}),
    };
    setSaving(true);
    if (!supabase) { showToast("저장했어요(데모)"); setSaving(false); return; }
    try {
      // account_id는 DEFAULT auth_account_id() — 생략(with_check 통과). onConflict=trainer_id → upsert(보낸 칸만 갱신).
      const { data, error } = await supabase.from("trainer_profile")
        .upsert(payload, { onConflict: "trainer_id" }).select();
      if (error || !data || data.length === 0) {
        console.error("trainer_profile 저장 실패", error);
        showToast("저장하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      showToast("세일즈북 설정을 저장했어요");
    } catch {
      showToast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card as="section">
        <Eyebrow icon={BookOpen}>회원 세일즈북</Eyebrow>
        <p className="mb-4 mt-2 text-[12px] text-muted">회원에게 보여주는 세일즈북 표지·마무리 장과 신규 등록 혜택 장에 그대로 들어가요.</p>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-4">
            {/* 표지·서명 */}
            <div className="rounded-xl border border-line bg-elevate p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-sub">
                <PenLine className="h-3.5 w-3.5 text-primary-strong" /> 표지·서명
              </div>
              <label className="block">
                <span className="mb-1 block text-[12px] text-muted">표시 이름</span>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={saving} maxLength={30} placeholder="예: 김도현 트레이너" className={inputCls} />
              </label>
              <label className="mt-2.5 block">
                <span className="mb-1 block text-[12px] text-muted">자격·경력 한 줄</span>
                <input type="text" value={credentials} onChange={(e) => setCredentials(e.target.value)} disabled={saving} maxLength={80} placeholder="예: 생활체육지도사 · 교정운동 전문 · 8년차" className={inputCls} />
              </label>
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] text-muted">서명 (마무리 장에 표시)</span>
                  <button type="button" onClick={clearSig} disabled={saving} className="text-[12px] text-primary-strong hover:underline disabled:opacity-50">다시</button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={320}
                  height={96}
                  onPointerDown={drawStart}
                  onPointerMove={drawMove}
                  onPointerUp={drawEnd}
                  onPointerLeave={drawEnd}
                  className="h-24 w-full touch-none rounded-lg border border-line bg-card"
                />
                <p className="mt-1 text-[11px] text-muted">손가락이나 펜으로 서명하세요. 한 번 저장하면 모든 세일즈북에 들어가요.</p>
              </div>
            </div>

            {/* 신규 등록 혜택 장 */}
            <div className="rounded-xl border border-line bg-elevate p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-sub">
                  <Gift className="h-3.5 w-3.5 text-primary-strong" /> 신규 등록 혜택 장
                </div>
                <button type="button" role="switch" aria-checked={benefitsOn} onClick={() => setBenefitsOn((v) => !v)} disabled={!hasBenefitCol}
                  className={`relative h-6 w-11 rounded-full transition ${benefitsOn ? "bg-primary" : "bg-line-strong"} disabled:opacity-40`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${benefitsOn ? "left-[22px]" : "left-0.5"}`} />
                  <span className="sr-only">신규 등록 혜택 장 넣기</span>
                </button>
              </div>
              <p className="mt-1 text-[12px] text-muted">켜면 신규 등록(OT) 세일즈북의 플랜 다음 장에 &lsquo;PT 등록하시면 함께 드려요&rsquo;가 들어가요. 재등록 세일즈북엔 안 들어가요.</p>
              {!hasBenefitCol && (
                <p className="mt-2 text-[12px] text-ot-text">이 기능은 아직 준비 중이에요. 표지·서명은 지금도 저장돼요.</p>
              )}
              {benefitsOn && hasBenefitCol && (
                <div className="mt-3 space-y-2">
                  {BENEFIT_PRESETS.map((t) => {
                    const on = benefits.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleBenefit(t)} aria-pressed={on}
                        className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition ${on ? "border-primary/40 bg-card text-ink" : "border-line bg-card/60 text-muted"}`}>
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-white" : "border-line-strong"}`}>
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        {t}
                      </button>
                    );
                  })}
                  {customItems.map((t) => (
                    <div key={t} className="flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 text-[13px] text-ink">
                      <Check className="h-4 w-4 shrink-0 text-primary-strong" />
                      <span className="flex-1">{t}</span>
                      <button type="button" onClick={() => toggleBenefit(t)} aria-label={`${t} 빼기`} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()}
                      className={inputCls} placeholder="직접 추가 (예: 매달 인바디 무료 측정)" maxLength={60} />
                    <Button variant="ghost" size="md" onClick={addCustom}><Plus className="h-4 w-4" /> 추가</Button>
                  </div>
                </div>
              )}
            </div>

            <Button variant="primary" size="md" fullWidth onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "세일즈북 설정 저장"}
            </Button>
          </div>
        )}
      </Card>
      <Toast message={toast} />
    </div>
  );
}

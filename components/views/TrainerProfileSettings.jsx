"use client";
/* 내 프로필 — 성향·강한 방향·세일즈 스타일·mbti·소개. trainer_profile(본인 1행 · upsert onConflict trainer_id).
   자기완결(PtPricingSettings 패턴: 마운트 fetch·데모 가드·.select() 하드닝·Toast). MyStats 통계와 독립.
   지금은 저장만 — 이후 AI 브리핑 개인화·배정 매칭의 재료(별도 스프린트). */
import { useEffect, useRef, useState } from "react";
import { UserCircle, PenLine } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { CLOSING_APPROACH_OPTS, SALES_INTENSITY_OPTS } from "@/lib/labels";
import Card from "@/components/ui/Card";
import { inputCls } from "@/components/ui/Field";

export default function TrainerProfileSettings() {
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approaches, setApproaches] = useState([]);   // strong_approaches (다중)
  const [salesStyle, setSalesStyle] = useState("");   // sales_style (단일)
  const [mbti, setMbti] = useState("");
  const [bio, setBio] = useState("");
  // S4 세일즈북 표지·서명 재료.
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [signature, setSignature] = useState(""); // PNG data URL(""=없음)
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
          setApproaches(Array.isArray(data.strong_approaches) ? data.strong_approaches : []);
          setSalesStyle(data.sales_style ?? "");
          setMbti(data.mbti ?? "");
          setBio(data.bio ?? "");
          setDisplayName(data.display_name ?? "");
          setCredentials(data.credentials ?? "");
          setSignature(data.signature_data_url ?? "");
        }
      } catch {
        /* 조회 실패 → 빈 폼 유지, 스피너만 해제 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (v) => setApproaches((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

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

  const save = async () => {
    if (saving) return;
    const payload = {
      trainer_id: uid,
      strong_approaches: approaches,
      sales_style: salesStyle || null,
      mbti: mbti.trim() || null,
      bio: bio.trim() || null,
      display_name: displayName.trim() || null,
      credentials: credentials.trim() || null,
      signature_data_url: signature || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    if (!supabase) { showToast("저장됨(데모)"); setSaving(false); return; }
    try {
      // account_id는 DEFAULT auth_account_id() — 생략(with_check 통과). onConflict=trainer_id → upsert.
      const { data, error } = await supabase.from("trainer_profile")
        .upsert(payload, { onConflict: "trainer_id" }).select();
      if (error || !data || data.length === 0) { showToast("저장 실패 — 다시 시도하세요"); setSaving(false); return; }
      showToast("프로필 저장됨");
      setSaving(false);
    } catch {
      showToast("저장 실패 — 다시 시도하세요");
    } finally {
      setSaving(false);
    }
  };
  const chip = (on) => `rounded-full px-3 py-1 text-xs font-medium transition ${on ? "bg-primary-soft text-primary-strong" : "bg-elevate text-sub hover:text-ink"}`;

  return (
    <div className="space-y-4">
      <Card as="section">
        <Eyebrow icon={UserCircle}>내 프로필</Eyebrow>
        <p className="mb-4 mt-2 text-[11px] text-muted">여기 입력은 이후 AI 브리핑이 내 스타일에 맞추는 재료가 돼요(개인화·배정). 지금은 저장만 됩니다.</p>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-muted">자신있는 방향 <span className="text-muted">(다중)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {CLOSING_APPROACH_OPTS.map((o) => (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)} disabled={saving} className={chip(approaches.includes(o.value))}>{o.label}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-muted">선호 세일즈 강도</span>
              <div className="flex flex-wrap gap-1.5">
                {SALES_INTENSITY_OPTS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setSalesStyle(salesStyle === o.value ? "" : o.value)} disabled={saving} className={chip(salesStyle === o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
            {/* 단일 항목이라 2열 grid로 감쌀 이유가 없었다(오른쪽 절반이 늘 빈칸). 4자 입력이라 폭도 제한. */}
            <label className="block sm:max-w-[12rem]">
              <span className="mb-1 block text-[11px] font-medium text-muted">MBTI <span className="text-muted">(선택)</span></span>
              <input type="text" value={mbti} onChange={(e) => setMbti(e.target.value)} disabled={saving} placeholder="ENFP" maxLength={4} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">성향·한줄 소개 <span className="text-muted">(선택)</span></span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} disabled={saving} rows={3} placeholder="예: 통증개선 특화, 공감형 상담, 초보자 편하게" className={inputCls} />
            </label>

            {/* ── 회원 세일즈북 표지·서명(S4) — 회원에게 보이는 자료에 그대로 표시됨. ── */}
            <div className="rounded-xl border border-line bg-elevate p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-label-ko text-sub">
                <PenLine className="h-3.5 w-3.5 text-primary-strong" /> 회원 세일즈북 표지·서명
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">표시 이름 <span className="text-muted">(표지에 표시)</span></span>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={saving} maxLength={30} placeholder="예: 김도현 트레이너" className={inputCls} />
              </label>
              <label className="mt-2.5 block">
                <span className="mb-1 block text-[11px] font-medium text-muted">자격·경력 한 줄 <span className="text-muted">(표지에 표시)</span></span>
                <input type="text" value={credentials} onChange={(e) => setCredentials(e.target.value)} disabled={saving} maxLength={80} placeholder="예: 생활체육지도사 · 교정운동 전문 · 8년차" className={inputCls} />
              </label>
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted">서명 <span className="text-muted">(마무리 슬라이드에 표시)</span></span>
                  <button type="button" onClick={clearSig} disabled={saving} className="text-[11px] font-medium text-primary-strong hover:underline disabled:opacity-50">다시</button>
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
                <p className="mt-1 text-[10px] text-muted">여기에 손가락/펜으로 서명하세요. 한 번 저장하면 모든 세일즈북에 자동으로 들어갑니다.</p>
              </div>
            </div>

            <Button variant="primary" size="md" fullWidth onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "프로필 저장"}
            </Button>
          </div>
        )}
      </Card>
      <Toast message={toast} />
    </div>
  );
}

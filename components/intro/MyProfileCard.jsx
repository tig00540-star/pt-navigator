"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 링크(사례 카드와 같음) */

/* =========================================================================
   설정 › 내 정보 '내 소개 · 세일즈북'(2026-10-11 · 점검 뒤 대표 결정: 따로 있던 카드 3개를 하나로)
   옛 '세일즈북에 들어갈 내 정보'(TrainerProfileSettings) + '내 소개 페이지'(TrainerIntroSettings) + '내 OT 신청 QR'(MyIntakeCard).
   같은 trainer_profile 한 행을 고치는데 저장 버튼이 둘이라 헷갈렸다 → 저장 하나.
   ① 나를 소개해요: 사진(고르면 바로 저장 · sales-cases/{계정}/profile/…) · 표시 이름 · 자격 한 줄 · 한 줄 소개 80자 · 전문 분야 5개
   ② 보여 줄 사례 4개(순서 · 사진 · 후기는 '동의받았어요' 체크한 것만 · 세일즈북 소개 장엔 앞 2개)
   ③ 서명(세일즈북 마지막 장) ④ 신규 등록 혜택 장(1차 변화 모음집 · 2차 세일즈북 · 재등록엔 안 들어감)
   ⑤ 이 소개가 보이는 곳 = 내 OT 신청 QR(IntakeQr) · 신청 페이지 열기.
   SQL 전(소개 칸 없음)이면 ①의 소개 · 전문 분야 · ②만 '준비 중' · 나머지는 그대로 저장된다. upsert는 보낸 칸만 바꾼다.
   혜택 문구: 회원 전용 페이지에 실제로 있는 기능만(BENEFIT_PRESETS) — 없는 기능을 약속하지 않는다.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Check, ExternalLink, Eye, Gift, PenLine, Plus, QrCode, Sparkles, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PHOTO_URL_TTL } from "@/lib/photoUrl";
import { compressImage } from "@/lib/image";
import { personName } from "@/lib/format";
import { useAccount } from "@/lib/useAccount";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import FilterChip from "@/components/ui/FilterChip";
import SectionTitle from "@/components/ui/SectionTitle";
import { inputCls } from "@/components/ui/Field";
import { signCaseUrls, loadMyCases } from "@/components/salesbook/caseData";
import { caseSummary } from "@/components/salesbook/DeckParts";
import { caseKindLabel } from "@/lib/salesCase";
import { INTRO_MAX_CASES, INTRO_SLIDE_CASES, needsConsent } from "@/lib/trainerIntro";
import TrainerIntro from "@/components/intro/TrainerIntro";
import IntakeQr from "@/components/intake/IntakeQr";

// 회원 전용 페이지에 실제로 있는 기능(app/m/[token]) — 새 기능이 생기면 여기에만 추가.
export const BENEFIT_PRESETS = [
  "회원 전용 페이지: 운동일지·인바디·무게 변화를 폰으로 언제든",
  "수업마다 운동일지를 보내 드려요 (회원님이 직접 확인)",
  "오운완 출석 챌린지: 꾸준히 오시면 포상",
  "비포애프터 사진·유산소·개인운동 기록 보관",
  "운동 달력으로 꾸준함을 한눈에",
];
export const INTRO_TAG_PRESETS = ["다이어트", "바디프로필", "벌크업", "체형교정", "근력", "체력 · 건강", "초보 환영", "재활 후 운동", "중장년", "여성 전문"];
const MAX_TAGS = 5;
const INTRO_MAX = 80;

function Box({ icon: Icon, title, hint, children }) {
  return (
    <div className="rounded-xl border border-line bg-elevate p-3.5">
      <p className="m-0 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Icon className="h-4 w-4 text-primary-strong" aria-hidden="true" /> {title}</p>
      {hint && <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-muted">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export default function MyProfileCard() {
  const me = useAccount();
  const { toast, showToast } = useToast();
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [introReady, setIntroReady] = useState(false);   // 소개 칸(SQL 2026-10-11)이 있는지
  const [hasBenefitCol, setHasBenefitCol] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // ① 나
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [intro, setIntro] = useState("");
  const [tags, setTags] = useState([]);
  const [customTag, setCustomTag] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  // ② 사례
  const [picked, setPicked] = useState([]);
  const [cases, setCases] = useState([]);
  const [urls, setUrls] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // ③ 서명 ④ 혜택
  const [signature, setSignature] = useState("");
  const [benefitsOn, setBenefitsOn] = useState(false);
  const [benefits, setBenefits] = useState([]);
  const [custom, setCustom] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const painted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      try {
        const { data: au } = await supabase.auth.getUser();
        const id = au?.user?.id ?? null;
        if (!id) return;
        const { data: p } = await supabase.from("trainer_profile").select("*").eq("trainer_id", id).maybeSingle();
        // 소개 칸이 있는지(SQL 전이면 '준비 중' · 개발 용어는 화면에 안 씀)
        const probe = await supabase.from("trainer_profile").select("intro, intro_cases").limit(1);
        const probe2 = await supabase.from("sales_case").select("consent_confirmed_at").limit(1);
        const ok = !probe.error && !probe2.error;
        let list = [], map = {}, pu = "";
        if (ok) {
          const { data: cs } = await loadMyCases(id);
          list = (cs || []).filter((c) => c.kind !== "care");   // 관리 모습은 변화 모음집에서만
          map = await signCaseUrls(list);
          if (p?.photo_path) {
            const { data: s } = await supabase.storage.from("sales-cases").createSignedUrl(p.photo_path, PHOTO_URL_TTL);
            pu = s?.signedUrl || "";
          }
        }
        if (cancelled) return;
        setUid(id);
        setIntroReady(ok);
        if (p) {
          setDisplayName(p.display_name ?? "");
          setCredentials(p.credentials ?? "");
          setSignature(p.signature_data_url ?? "");
          setHasBenefitCol("salesbook_benefits" in p);
          const sb = p.salesbook_benefits;
          if (sb && typeof sb === "object") {
            setBenefitsOn(Boolean(sb.enabled));
            setBenefits(Array.isArray(sb.items) ? sb.items.filter((x) => typeof x === "string") : []);
          }
          setIntro(p.intro || "");
          setTags(Array.isArray(p.tags) ? p.tags.filter(Boolean) : []);
          setPicked((Array.isArray(p.intro_cases) ? p.intro_cases : []).filter((cid) => list.some((c) => c.id === cid)));
          setPhotoPath(p.photo_path || "");
        }
        setPhotoUrl(pu);
        setCases(list);
        setUrls(map);
      } catch (e) {
        console.error("내 소개 읽기 실패", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 저장된 서명을 캔버스에 1회 페인트(로딩 완료 후)
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

  const usable = (c) => !needsConsent(c) || !!c.consent_confirmed_at;
  const pickedCases = picked.map((id) => cases.find((c) => c.id === id)).filter(Boolean);
  const name = displayName.trim() || personName(me.trainerName) || "";
  const previewIntro = useMemo(() => ({
    name, credentials: credentials.trim(), intro: intro.trim(), tags, photo: photoUrl || null,
    cases: pickedCases.filter(usable).map((c) => ({ id: c.id, kind: c.kind, label: c.label, note: c.note, data: c.data || {} })),
    urls,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [name, credentials, intro, tags, photoUrl, picked, cases, urls]);

  const touch = (fn) => (...a) => { setDirty(true); fn(...a); };
  const toggleTag = touch((t) => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : x.length >= MAX_TAGS ? x : [...x, t])));
  const addCustomTag = () => {
    const t = customTag.trim().slice(0, 12);
    if (!t) return;
    if (tags.length >= MAX_TAGS) { showToast(`전문 분야는 ${MAX_TAGS}개까지예요`); return; }
    if (!tags.includes(t)) { setTags((x) => [...x, t]); setDirty(true); }
    setCustomTag("");
  };
  const togglePick = touch((id) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length >= INTRO_MAX_CASES ? x : [...x, id])));
  const move = touch((i, d) => setPicked((x) => {
    const j = i + d;
    if (j < 0 || j >= x.length) return x;
    const n = [...x]; [n[i], n[j]] = [n[j], n[i]]; return n;
  }));
  const toggleBenefit = touch((t) => setBenefits((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t])));
  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    setBenefits((p) => (p.includes(t) || p.length >= 8 ? p : [...p, t]));
    setDirty(true);
    setCustom("");
  };
  const customItems = benefits.filter((b) => !BENEFIT_PRESETS.includes(b));

  // 서명 — pointer 이벤트(마우스 + 터치). 내부 해상도 320×96 고정.
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
  const drawEnd = () => { if (!drawing.current) return; drawing.current = false; setSignature(canvasRef.current.toDataURL("image/png")); setDirty(true); };
  const clearSig = () => { const c = canvasRef.current; c?.getContext("2d").clearRect(0, 0, c.width, c.height); setSignature(""); setDirty(true); };

  const upsert = async (fields) => {
    const { data, error } = await supabase.from("trainer_profile")
      .upsert({ trainer_id: uid, ...fields, updated_at: new Date().toISOString() }, { onConflict: "trainer_id" }).select();
    if (error || !data || data.length === 0) { console.error("내 소개 저장 실패", error); return null; }
    return data[0];
  };

  const save = async () => {
    if (saving || !uid) return;
    setSaving(true);
    try {
      const row = await upsert({
        display_name: displayName.trim() || null,
        credentials: credentials.trim() || null,
        signature_data_url: signature || null,
        ...(hasBenefitCol ? { salesbook_benefits: { enabled: benefitsOn, items: benefits } } : {}),
        ...(introReady ? { intro: intro.trim() || null, tags: tags.length ? tags : null, intro_cases: picked.filter((id) => usable(cases.find((c) => c.id === id) || {})) } : {}),
      });
      if (!row) { showToast("저장하지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
      setDirty(false);
      showToast("내 소개 · 세일즈북을 저장했어요");
    } catch { showToast("저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };

  // 사진은 고르면 바로 저장(올린 파일이 주인 없이 남지 않게) · 바꾸면 옛 파일은 지운다.
  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uid || uploading) return;
    setUploading(true);
    try {
      const { data: t } = await supabase.from("trainer").select("account_id").eq("id", uid).maybeSingle();
      if (!t?.account_id) { showToast("올리지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
      const blob = await compressImage(file, 800, 0.85);
      const path = `${t.account_id}/profile/${crypto.randomUUID()}.jpg`;
      const { error: ue } = await supabase.storage.from("sales-cases").upload(path, blob, { contentType: "image/jpeg" });
      if (ue) { console.error("프로필 사진 올리기 실패", ue); showToast("올리지 못했어요. 다시 시도해 주세요."); return; }
      const row = await upsert({ photo_path: path });
      if (!row) { await supabase.storage.from("sales-cases").remove([path]); showToast("저장하지 못했어요. 다시 시도해 주세요."); return; }
      const old = photoPath;
      const { data: s } = await supabase.storage.from("sales-cases").createSignedUrl(path, PHOTO_URL_TTL);
      setPhotoPath(path); setPhotoUrl(s?.signedUrl || "");
      if (old) await supabase.storage.from("sales-cases").remove([old]);
      showToast("사진을 바꿨어요");
    } catch (err) {
      console.error(err);
      showToast("사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.");
    } finally { setUploading(false); }
  };
  const removePhoto = async () => {
    if (!photoPath || uploading) return;
    setUploading(true);
    try {
      const row = await upsert({ photo_path: null });
      if (!row) { showToast("빼지 못했어요. 다시 시도해 주세요."); return; }
      await supabase.storage.from("sales-cases").remove([photoPath]);
      setPhotoPath(""); setPhotoUrl("");
      showToast("사진을 뺐어요");
    } finally { setUploading(false); }
  };

  const openPage = async () => {
    try {
      const { data, error } = await supabase.rpc("intake_link_get", { p_trainer: uid, p_rotate: false });
      if (error || !data) { console.error(error); showToast("페이지를 열지 못했어요. 다시 시도해 주세요."); return; }
      window.open(`/join/${data}`, "_blank", "noopener");
    } catch { showToast("페이지를 열지 못했어요. 다시 시도해 주세요."); }
  };

  return (
    <Card as="section">
      <SectionTitle icon={UserRound}>내 소개 · 세일즈북</SectionTitle>
      <p className="-mt-1.5 mb-4 text-[13px] leading-relaxed text-sub">
        한 번 적어 두면 OT 신청 페이지 맨 위와 세일즈북(표지 · 소개 장 · 마지막 장)에 그대로 들어가요.
      </p>

      {loading ? <p className="m-0 text-[13px] text-muted">불러오는 중이에요</p> : (
        <div className="space-y-4">
          {/* ① 나를 소개해요 */}
          <Box icon={UserRound} title="나를 소개해요">
            {introReady && (
              <div>
                <div className="flex items-center gap-4">
                  {photoUrl
                    ? <img src={photoUrl} alt="내 사진" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                    : <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[22px] font-black text-primary-strong">{(name || "트").slice(0, 1)}</div>}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-[13px] font-semibold text-ink hover:border-primary ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                      <Camera className="h-4 w-4" aria-hidden="true" /> {uploading ? "올리는 중이에요" : photoUrl ? "사진 바꾸기" : "사진 올리기"}
                      <input type="file" accept="image/*" onChange={onPhoto} className="sr-only" />
                    </label>
                    {photoUrl && <button type="button" onClick={removePhoto} disabled={uploading} className="min-h-[40px] px-2 text-[13px] text-sub hover:text-ink disabled:opacity-50">빼기</button>}
                  </div>
                </div>
                <p className="m-0 mt-1.5 text-[12px] text-muted">사진은 선택이에요. 고르면 바로 저장돼요. 없으면 이름 첫 글자로 보여요.</p>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">표시 이름</span>
              <input type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setDirty(true); }} disabled={saving} maxLength={30} placeholder="예: 김도현 트레이너" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">자격 · 경력 한 줄</span>
              <input type="text" value={credentials} onChange={(e) => { setCredentials(e.target.value); setDirty(true); }} disabled={saving} maxLength={80} placeholder="예: 생활스포츠지도사 2급 · 교정운동 · 8년차" className={inputCls} />
            </label>
            {introReady ? (
              <>
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-[12px] text-muted">한 줄 소개 <span>{intro.length}/{INTRO_MAX}</span></span>
                  <textarea value={intro} onChange={(e) => { setIntro(e.target.value.slice(0, INTRO_MAX)); setDirty(true); }} rows={2} maxLength={INTRO_MAX}
                    placeholder="예: 바쁜 직장인도 주 2회로 달라지는 몸, 기록으로 보여 드려요" className={inputCls} />
                </label>
                <div>
                  <span className="mb-1.5 flex items-center justify-between text-[12px] text-muted">전문 분야 <span>{tags.length}/{MAX_TAGS}</span></span>
                  <div className="flex flex-wrap gap-1.5">
                    {[...INTRO_TAG_PRESETS, ...tags.filter((t) => !INTRO_TAG_PRESETS.includes(t))].map((t) => (
                      <FilterChip key={t} selected={tags.includes(t)} onClick={() => toggleTag(t)} disabled={!tags.includes(t) && tags.length >= MAX_TAGS}>{t}</FilterChip>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
                      maxLength={12} placeholder="직접 적기 (12자)" className={inputCls} />
                    <Button size="sm" onClick={addCustomTag} disabled={!customTag.trim() || tags.length >= MAX_TAGS} className="shrink-0"><Plus className="h-4 w-4" aria-hidden="true" /> 추가</Button>
                  </div>
                </div>
              </>
            ) : <p className="m-0 text-[12px] text-ot-text">사진 · 한 줄 소개 · 전문 분야는 아직 준비 중이에요.</p>}
          </Box>

          {/* ② 보여 줄 사례 */}
          {introReady && (
            <Box icon={Sparkles} title={`보여 줄 사례 ${picked.length}/${INTRO_MAX_CASES}`}
              hint={`신청 페이지엔 고른 사례가 다 보이고, 세일즈북 소개 장엔 위의 ${INTRO_SLIDE_CASES}개만 들어가요. 숫자 사례는 이름 없이 나이대 · 기간으로만 보여요. 사진 · 후기는 회원님께 동의를 받고 사례 보관함에서 체크한 것만 고를 수 있어요.`}>
              {pickedCases.length > 0 ? (
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {pickedCases.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{c.label || caseKindLabel(c.kind)}</span>
                        <span className="block truncate text-[12px] text-muted">{caseKindLabel(c.kind)} · {caseSummary(c)}{!usable(c) ? " · 동의 체크 필요" : ""}</span>
                      </span>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" className="flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-elevate disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === pickedCases.length - 1} aria-label="아래로" className="flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-elevate disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => togglePick(c.id)} aria-label="내 소개에서 내리기" className="flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-elevate hover:text-danger-text"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              ) : <p className="m-0 text-[13px] text-muted">아직 고른 사례가 없어요. 사례 없이 소개만 보여도 돼요.</p>}
              <button type="button" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}
                className="inline-flex min-h-[40px] items-center gap-1 text-[13px] font-semibold text-primary-strong">
                <Plus className="h-4 w-4" aria-hidden="true" /> {pickerOpen ? "고르기 닫기" : "사례 보관함에서 고르기"}
              </button>
              {pickerOpen && (
                cases.length === 0 ? (
                  <p className="m-0 text-[13px] text-muted">사례 보관함이 비어 있어요. 세일즈북 › 사례 보관함에서 먼저 담아 주세요.</p>
                ) : (
                  <ul className="m-0 max-h-[320px] list-none space-y-1 overflow-y-auto p-0">
                    {cases.map((c) => {
                      const on = picked.includes(c.id);
                      const ok = usable(c);
                      const full = !on && picked.length >= INTRO_MAX_CASES;
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => ok && togglePick(c.id)} disabled={!ok || full} aria-pressed={on}
                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${on ? "border-primary bg-primary-soft" : "border-line bg-card"} disabled:opacity-60`}>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-semibold text-ink">{c.label || caseKindLabel(c.kind)}</span>
                              <span className="block truncate text-[12px] text-muted">
                                {caseKindLabel(c.kind)} · {caseSummary(c)}
                                {!ok && " · 보관함에서 '동의받았어요' 체크가 필요해요"}
                              </span>
                            </span>
                            {on && <span className="shrink-0 text-[12px] font-bold text-primary-strong">고름</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </Box>
          )}

          {/* ③ 서명 */}
          <Box icon={PenLine} title="서명" hint="세일즈북 마지막 장(약속드릴게요)에 들어가요. 손가락이나 펜으로 써 주세요.">
            <div>
              <div className="mb-1 flex justify-end">
                <button type="button" onClick={clearSig} disabled={saving} className="min-h-[32px] px-1 text-[12px] text-primary-strong hover:underline disabled:opacity-50">다시 쓰기</button>
              </div>
              <canvas ref={canvasRef} width={320} height={96}
                onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={drawEnd} onPointerLeave={drawEnd}
                className="h-24 w-full touch-none rounded-lg border border-line bg-card" />
            </div>
          </Box>

          {/* ④ 신규 등록 혜택 장 */}
          <Box icon={Gift} title="신규 등록 혜택 장"
            hint="켜면 'PT 등록하시면 함께 드려요' 장이 1차 OT 변화 모음집(관리 모습 다음)과 2차 OT 세일즈북(플랜 다음)에 들어가요. 재등록 세일즈북엔 안 들어가요.">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-sub">{benefitsOn ? "켜져 있어요" : "꺼져 있어요"}</span>
              <button type="button" role="switch" aria-checked={benefitsOn} onClick={() => { setBenefitsOn((v) => !v); setDirty(true); }} disabled={!hasBenefitCol}
                className={`relative h-6 w-11 rounded-full transition ${benefitsOn ? "bg-primary" : "bg-line-strong"} disabled:opacity-40`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${benefitsOn ? "left-[22px]" : "left-0.5"}`} />
                <span className="sr-only">신규 등록 혜택 장 넣기</span>
              </button>
            </div>
            {!hasBenefitCol && <p className="m-0 text-[12px] text-ot-text">이 기능은 아직 준비 중이에요.</p>}
            {benefitsOn && hasBenefitCol && (
              <div className="space-y-2">
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
          </Box>

          {/* 저장 · 미리 보기 */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={save} disabled={saving || !dirty}>{saving ? "저장 중이에요" : "저장"}</Button>
              {introReady && <Button onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen}><Eye className="h-4 w-4" aria-hidden="true" /> {previewOpen ? "미리 보기 닫기" : "신청 페이지 미리 보기"}</Button>}
            </div>
            {dirty && <p className="m-0 mt-2 text-[12px] text-muted">저장해야 신청 페이지 · 세일즈북에 반영돼요.</p>}
          </div>
          {previewOpen && (
            <div className="rounded-2xl bg-bg p-3">
              {previewIntro.intro || previewIntro.tags.length || previewIntro.cases.length || previewIntro.photo
                ? <TrainerIntro intro={previewIntro} />
                : <p className="m-0 p-3 text-center text-[13px] text-muted">한 줄 소개나 전문 분야를 넣으면 이렇게 보여요.</p>}
            </div>
          )}

          {/* ⑤ 이 소개가 보이는 곳 — 내 OT 신청 QR */}
          {uid && (
            <Box icon={QrCode} title="내 OT 신청 QR"
              hint="앞에 있는 회원은 QR로 찍게 하고, 멀리 있는 회원에겐 링크를 카톡으로 보내세요. 회원이 신청서를 남기면 내 OT 회원으로 바로 등록돼요. 위 소개는 신청서 맨 위에 보여요.">
              <IntakeQr trainerId={uid} showToast={showToast} />
              <Button size="sm" onClick={openPage} disabled={dirty} title={dirty ? "저장한 뒤에 열 수 있어요" : undefined}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> 신청 페이지 열기
              </Button>
            </Box>
          )}
        </div>
      )}
      <Toast message={toast} />
    </Card>
  );
}

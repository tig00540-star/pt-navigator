"use client";

/* =========================================================================
   PostureAssessment — 체형평가(OT 신규 회원 세일즈 도구).
   ★핵심: 정면·측면·후면 사진 + '가로세로 그리드 오버레이'로 시각 측정(회원에게 보여주며 설득).
   보조: 항목별 소견 체크(AI 분석 입력). → posture_assessment 저장 + AI 분석(회원 대면).
   사진 업로드는 member-photos 버킷 재활용(MemberPhotoSummary 패턴 · compressImage · 서명URL).
   ⚠️ AI 분석은 '앱이 객관 분석' 톤(세일즈 표현 금지) — InbodyAnalysis 재사용(title="체형 분석").
   ⚠️ 마이그레이션 전이면 저장/조회 실패 → 안내(비차단).
   ========================================================================= */

import { useCallback, useEffect, useState } from "react";
import { PersonStanding, Plus, Sparkles, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/image";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ImageLightbox from "@/components/ui/ImageLightbox";
import { inputCls } from "@/components/ui/Field";
import { authHeader } from "@/lib/authHeader";
import { POSTURE_ITEMS, POSTURE_STATES } from "@/lib/posture";
import { loadOtRound1, saveOtRound1Key, cacheFor } from "@/lib/otCache";
import InbodyAnalysis from "@/components/views/InbodyAnalysis";

const SLOTS = [
  { key: "front", label: "정면" },
  { key: "side", label: "측면" },
  { key: "back", label: "후면" },
];

function emptyFindings() {
  const o = {};
  for (const it of POSTURE_ITEMS) o[it.key] = "";
  return o;
}

// 사진 위 가로세로 그리드 — 세로 중심선(빨강 플럼라인) + 3분할선. 정렬 어긋남이 눈에 보이게.
function GridPhoto({ url, onOpen, onRemove }) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-line bg-elevate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="체형 사진" onClick={onOpen} className="h-full w-full cursor-pointer object-cover" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary/70" />
        <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
        <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
        <div className="absolute top-1/4 left-0 h-px w-full bg-white/40" />
        <div className="absolute top-1/2 left-0 h-px w-full bg-primary/45" />
        <div className="absolute top-3/4 left-0 h-px w-full bg-white/40" />
      </div>
      {onRemove && (
        <button onClick={onRemove} className="absolute right-1 top-1 rounded-lg bg-card/85 p-1 text-muted transition hover:text-rose-600" aria-label="사진 삭제">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function PostureAssessment({ member }) {
  const [photos, setPhotos] = useState({}); // {front,side,back} → 스토리지 경로
  const [urls, setUrls] = useState({}); // path → 서명 URL(1h)
  const [findings, setFindings] = useState(emptyFindings());
  const [note, setNote] = useState("");
  const [busySlot, setBusySlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [lightbox, setLightbox] = useState(null);
  // 분석 결과는 1차 행(report.posture_analysis)에 캐시 — 사진 비전 호출이라 재방문마다 부르면 비싸다.
  const [analysis, setAnalysis] = useState(null);
  const [anaLoading, setAnaLoading] = useState(false);
  const [anaNotice, setAnaNotice] = useState("");
  const [otRow, setOtRow] = useState(null);       // 1차 행 { id, report } — 캐시 자리
  const [assessId, setAssessId] = useState(null); // 최신 체형평가 행 id — 캐시 유효성 기준
  const memberId = member?.id;

  // 경로들 → 서명 URL 맵.
  const signPaths = useCallback(async (paths) => {
    const list = paths.filter(Boolean);
    if (!supabase || list.length === 0) { setUrls({}); return; }
    const { data } = await supabase.storage.from("member-photos").createSignedUrls(list, 3600);
    const map = {};
    (data || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
    setUrls(map);
  }, []);

  // 최근 평가 프리필(회원 전환은 FirstOTTab 최상위라 id 바뀌면 재조회).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !memberId) return;
      const { data } = await supabase
        .from("posture_assessment")
        .select("*")
        .eq("user_id", memberId)
        .order("assessed_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = data?.[0] || null;
      setAssessId(row?.id || null);
      const ph = row?.photos || {};
      setPhotos(ph);
      if (row?.findings) setFindings({ ...emptyFindings(), ...row.findings });
      if (row?.note) setNote(row.note);
      await signPaths(SLOTS.map((s) => ph[s.key]));
      const ot = await loadOtRound1(memberId);
      if (!cancelled) setOtRow(ot);
    })();
    return () => { cancelled = true; };
  }, [memberId, signPaths]);

  // 지금 저장된 평가를 보고 만든 캐시만 쓴다 — 새로 평가했으면 옛 분석을 띄우지 않는다.
  const shownAnalysis = analysis ?? cacheFor(otRow?.report?.posture_analysis, assessId);

  const setF = (k, v) => setFindings((s) => ({ ...s, [k]: v }));
  const cleanFindings = () => {
    const c = {};
    for (const it of POSTURE_ITEMS) if (findings[it.key]) c[it.key] = findings[it.key];
    return c;
  };

  // 슬롯 사진 업로드 — 압축→member-photos 버킷→경로 저장→서명URL 갱신.
  const onPick = (slot) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busySlot) return;
    if (!supabase || !memberId) { setMsg("정보를 불러오는 중이에요. 잠시 후 다시."); return; }
    setBusySlot(slot); setMsg("");
    let blob;
    try { blob = await compressImage(file); }
    catch { setBusySlot(""); setMsg("이 사진을 읽지 못했어요. 다른 사진으로 시도하세요."); return; }
    const path = `${memberId}/posture/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage.from("member-photos").upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) { setBusySlot(""); setMsg("업로드 실패: " + upErr.message); return; }
    const next = { ...photos, [slot]: path };
    setPhotos(next);
    await signPaths(SLOTS.map((s) => next[s.key]));
    setBusySlot("");
  };

  const removeSlot = (slot) => async () => {
    const path = photos[slot];
    if (!path) return;
    if (supabase) await supabase.storage.from("member-photos").remove([path]);
    const next = { ...photos, [slot]: null };
    setPhotos(next);
    await signPaths(SLOTS.map((s) => next[s.key]));
  };

  const save = async () => {
    if (saving) return;
    const clean = cleanFindings();
    const photoClean = {};
    for (const s of SLOTS) if (photos[s.key]) photoClean[s.key] = photos[s.key];
    if (Object.keys(clean).length === 0 && Object.keys(photoClean).length === 0) {
      setMsg("사진을 올리거나 항목을 하나 이상 평가하세요."); return;
    }
    if (!supabase) { setMsg("데모 모드 — 저장하려면 Supabase 키가 필요합니다."); return; }
    setSaving(true); setMsg("");
    const { data, error } = await supabase
      .from("posture_assessment")
      .insert({ user_id: memberId, findings: clean, photos: photoClean, note: note.trim() || null })
      .select();
    setSaving(false);
    if (error || !data || data.length === 0) {
      setMsg("저장 실패 — 체형평가 마이그레이션이 실행됐는지 확인하세요. " + (error?.message || ""));
      return;
    }
    // 새 평가가 기준이 된다 — 이전 평가로 만든 분석 캐시는 이 시점부터 안 쓴다.
    setAssessId(data[0].id);
    setMsg("저장됐어요.");
  };

  const analyze = async () => {
    if (anaLoading) return;
    const clean = cleanFindings();
    // 업로드된 사진의 서명 URL을 함께 보내면 AI가 사진을 '직접' 관찰(비전)해 소견을 도출한다.
    const photoUrls = SLOTS
      .filter((s) => photos[s.key] && urls[photos[s.key]])
      .map((s) => ({ label: s.label, url: urls[photos[s.key]] }));
    if (Object.keys(clean).length === 0 && photoUrls.length === 0) {
      setAnaNotice("사진을 올리거나 소견을 하나 이상 체크해 주세요."); return;
    }
    setAnaLoading(true); setAnaNotice("");
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "posture", member, posture: { findings: clean, note: note.trim(), photoUrls } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAnaNotice((d.error || "분석 생성에 실패했습니다.") + " (AI 키/구독 상태를 확인하세요)");
        return;
      }
      const result = await res.json();
      setAnalysis(result);
      const merged = await saveOtRound1Key(otRow, "posture_analysis", {
        data: result,
        meta: { generatedAt: new Date().toISOString(), sourceId: assessId },
      });
      if (merged) setOtRow((r) => ({ ...r, report: merged }));
      else if (otRow) setAnaNotice("분석은 나왔지만 저장에 실패했어요 — 이 화면에서만 보입니다. (권한/정책 확인)");
    } catch (e) {
      setAnaNotice("네트워크 오류: " + (e?.message || "unknown"));
    } finally {
      setAnaLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 사진 + 그리드 — 시각 측정(회원에게 보여주기) */}
      <Card as="section">
        <Eyebrow icon={PersonStanding}>체형 사진 · 가로세로 측정</Eyebrow>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">정면·측면·후면 사진을 올리면 그리드가 겹쳐져 어긋난 정렬이 눈에 보여요. 회원에게 그대로 보여주며 짚어주세요.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SLOTS.map((s) => (
            <div key={s.key}>
              <div className="mb-1 text-center text-[11px] font-semibold text-sub">{s.label}</div>
              {photos[s.key] && urls[photos[s.key]] ? (
                <GridPhoto url={urls[photos[s.key]]} onOpen={() => setLightbox(urls[photos[s.key]])} onRemove={removeSlot(s.key)} />
              ) : (
                <label className={`flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong bg-elevate text-[11px] font-semibold text-muted ${busySlot === s.key ? "opacity-60" : ""}`}>
                  <ImagePlus className="h-5 w-5" />
                  {busySlot === s.key ? "올리는 중…" : "사진"}
                  <input type="file" accept="image/*" onChange={onPick(s.key)} disabled={Boolean(busySlot)} className="hidden" />
                </label>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 소견 체크(보조 · AI 분석 입력) */}
      <Card as="section">
        <Eyebrow icon={PersonStanding}>소견 체크 <span className="text-[10px] font-normal text-muted">(AI 분석 근거)</span></Eyebrow>
        <div className="mt-3 space-y-2">
          {POSTURE_ITEMS.map((it) => (
            <div key={it.key} className="flex items-center gap-2">
              <span className="flex-1 text-[13px] text-ink">{it.label}</span>
              <select
                value={findings[it.key]}
                onChange={(e) => setF(it.key, e.target.value)}
                className="w-28 shrink-0 rounded-lg border border-line bg-elevate px-2 py-1.5 text-[13px] text-ink outline-none focus:border-primary"
                aria-label={it.label}
              >
                {POSTURE_STATES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
              </select>
            </div>
          ))}
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택) · 특이사항" className={`${inputCls} mt-1`} />
          {msg && <div className="text-[12px] text-sub">{msg}</div>}
          <div className="pt-1">
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> {saving ? "저장 중…" : "평가 저장"}
            </Button>
          </div>
        </div>
      </Card>

      {/* AI 분석 — 회원 대면 */}
      <Card as="section">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow icon={Sparkles}>체형 분석 · 회원에게 보여주기</Eyebrow>
          <Button variant="primary" size="sm" onClick={analyze} disabled={anaLoading}>
            {anaLoading ? "분석 중…" : shownAnalysis ? "다시 분석" : "AI 분석"}
          </Button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          업로드한 <b className="text-sub">사진을 AI가 직접 관찰</b>하고 소견 체크도 함께 반영해요. 트레이너가 아니라 &lsquo;앱이 분석&rsquo;하는 톤이라 회원 부담이 적어요.
        </p>
        {anaNotice && <p className="mt-2 text-[12px] text-danger-text">{anaNotice}</p>}
        {shownAnalysis && <div className="mt-3"><InbodyAnalysis data={{ ...shownAnalysis, metrics: shownAnalysis.findings }} title="체형 분석" /></div>}
      </Card>

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

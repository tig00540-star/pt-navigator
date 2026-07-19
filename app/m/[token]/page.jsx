"use client";

/* =========================================================================
   회원 홈 (/m/<member_token>) — 읽기전용. 끝4 로그인(S1 라우트) → setSession →
   안전 뷰 3개(member_me·member_workout_log·member_inbody) 조회. 자가입력 없음·매출요소 0.
   트레이너 앱과 같은 토큰(bg·card·ink·line·primary)이되 회원용이라 글씨 크게·정보 밀도 낮게.
   ========================================================================= */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { NotebookPen, Scale, Dumbbell, TrendingUp, TrendingDown, Minus, LogOut, ChevronDown, Activity, Plus, Trash2, Camera, ImagePlus, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { memberSupabase } from "@/lib/memberSupabase";
import { INBODY_FIELDS } from "@/lib/labels";
import { holidayName } from "@/lib/holidays";
import { buildExerciseSeries } from "@/lib/workout";
import { compressImage } from "@/lib/image";
import Wordmark from "@/components/ui/Wordmark";
import Eyebrow from "@/components/ui/Eyebrow";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import Sparkline from "@/components/ui/Sparkline";
import ImageLightbox from "@/components/ui/ImageLightbox";

// purge-safe delta 색 맵(PtInbodyTab 재사용 패턴 · 동적 조립 금지).
const DELTA_TONE = { good: "text-primary-strong", bad: "text-rose-600", flat: "text-muted" };
// 무게 변화 톤 — 증가=good, 감소=bad, 동일=flat(인바디 deltaTone과 달리 무게는 항상 증가=good).
const weightTone = (d) => (d > 0 ? "good" : d < 0 ? "bad" : "flat");
// 사진 라벨(자가 분류) — 값→한글. 정적 문자열이라 purge 무관.
const PHOTO_LABELS = { before: "비포", progress: "진행", after: "애프터" };

// 활동 마커 스타일 — 값→{라벨, 점 색}. 정적 문자열 맵(퍼지 안전 · 동적 조립 금지).
const ACTIVITY_MARKS = {
  pt:       { label: "PT",       dot: "bg-primary" },   // 브랜드 레드
  personal: { label: "개인운동", dot: "bg-amber-500" },
  cardio:   { label: "유산소",   dot: "bg-sky-500" },
};
const MARK_ORDER = ["pt", "personal", "cardio"]; // 점 표시 순서 고정

// 로컬 'YYYY-MM-DD'
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// logs/cardio/schedule → { 'YYYY-MM-DD': Set('pt'|'personal'|'cardio') }
function buildActivityMap(logs, cardio, schedule) {
  const map = {};
  const add = (key, type) => { (map[key] ||= new Set()).add(type); };
  (logs || []).forEach((l) => { const iso = l.session_at ?? l.created_at; if (iso) add(ymd(new Date(iso)), "pt"); });
  (schedule || []).forEach((s) => { if (s.on_date) add(s.on_date, s.kind === "pt" ? "pt" : "personal"); });
  (cardio || []).forEach((c) => { if (c.performed_on) add(c.performed_on, "cardio"); });
  return map;
}

// 변화 방향 → 좋음/나쁨/중립. before·cur 하나라도 null이면 null(표시 안 함).
function deltaTone(field, cur, before) {
  if (cur == null || before == null) return null;
  const d = cur - before;
  if (d === 0 || !field.goodDir) return "flat";
  if ((d > 0 && field.goodDir === "up") || (d < 0 && field.goodDir === "down")) return "good";
  return "bad";
}

// 날짜 표기(브라우저=KST 전제). arg 있는 new Date라 purity 규칙 무관.
function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? String(iso) : d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}
const fmtDelta = (d) => (d > 0 ? "+" : "") + (Math.round(d * 10) / 10);

// 오늘(로컬) YYYY-MM-DD — date input 기본값. 클라 마운트 후 계산(lazy init)이라 hydration 무관.
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function ScreenMsg({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function LoginCard({ last4, setLast4, onSubmit, busy, err }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-ink">내 운동 기록</div>
          <div className="mt-1 text-sm text-muted">본인 확인 후 열람할 수 있어요</div>
        </div>
        <label className="mb-1.5 block text-sm font-medium text-sub">휴대폰 뒤 4자리</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          placeholder="0000"
          className="w-full rounded-lg border border-line bg-elevate px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] text-ink placeholder-muted outline-none focus:border-primary"
        />
        {err && <div className="mt-2 text-sm text-rose-600">{err}</div>}
        <div className="mt-4">
          <Button variant="primary" size="md" fullWidth onClick={onSubmit} disabled={busy}>
            {busy ? "확인 중…" : "확인"}
          </Button>
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          담당 트레이너가 보내준 링크로 접속하셨어요. 본인 기록만 안전하게 열람됩니다.
        </p>
      </div>
    </div>
  );
}

// 유산소 자가입력(M1) — 회원이 자기 cardio_log를 CRUD(트레이너는 읽기만). 회원용 큰 글씨·입력 최소.
function CardioSection({ me, cardio, onReload, mode }) {
  const [on, setOn] = useState(() => todayStr());
  const [kind, setKind] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const inputCls =
    "mt-1 w-full min-w-0 rounded-lg border border-line bg-elevate px-3 py-2.5 text-base text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  const add = async () => {
    if (busy) return;
    if (!memberSupabase) { setErr("데모 모드 — 실제 기록은 불가해요."); return; }
    if (!me?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시 시도하세요."); return; }
    if (!on) { setErr("날짜를 선택하세요."); return; }
    setBusy(true); setErr("");
    // 하드닝: .select()로 반환 확인 — 0행이면 실패(RLS/정책). user_id는 me.id만(RLS with check가 스푸핑 차단).
    const { data, error } = await memberSupabase
      .from("cardio_log")
      .insert({
        user_id: me.id,
        performed_on: on,
        kind: kind.trim() || null,
        minutes: Number(minutes) || null,
        note: note.trim() || null,
      })
      .select();
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("기록 저장에 실패했어요" + (error ? ": " + error.message : " (0행)"));
      return;
    }
    setKind(""); setMinutes(""); setNote(""); // 날짜는 유지(연속 입력 편의)
    await onReload();
    setBusy(false);
  };

  const remove = async (id) => {
    if (busy) return;
    if (!memberSupabase) return;
    setBusy(true); setErr("");
    const { data, error } = await memberSupabase
      .from("cardio_log")
      .delete()
      .eq("id", id)
      .select(); // 하드닝: 0행이면 실패
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("삭제에 실패했어요" + (error ? ": " + error.message : " (0행)"));
      return;
    }
    await onReload();
    setBusy(false);
  };

  return (
    <section className="mb-8">
      <Eyebrow icon={Activity}>유산소 기록</Eyebrow>
      {mode !== "list" && (
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            날짜
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} disabled={busy} className={inputCls} />
          </label>
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            시간(분)
            <input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={busy} placeholder="30" className={inputCls} />
          </label>
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            종류
            <input type="text" value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy} placeholder="러닝 / 사이클 / 걷기…" className={inputCls} />
          </label>
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            메모(선택)
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="가볍게 조깅" className={inputCls} />
          </label>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <div className="mt-3">
          <Button variant="primary" size="md" fullWidth onClick={add} disabled={busy}>
            <Plus className="h-4 w-4" /> {busy ? "저장 중…" : "기록"}
          </Button>
        </div>
      </div>
      )}

      {/* 목록 — 내 기록 탭에서만(mode=list) */}
      {mode !== "form" && (cardio.length === 0 ? (
        <EmptyState className="mt-3 rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
          아직 유산소 기록이 없어요. 오늘 운동을 남겨보세요.
        </EmptyState>
      ) : (
        <ul className="mt-3 space-y-2">
          {cardio.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-primary-strong">{fmtDay(c.performed_on)}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base text-ink">{c.kind || "유산소"}</span>
                  {c.minutes != null && <span className="font-mono text-sm font-bold text-ink">{c.minutes}분</span>}
                </div>
                {c.note && <div className="mt-0.5 text-sm text-muted">{c.note}</div>}
              </div>
              <button
                onClick={() => remove(c.id)}
                disabled={busy}
                className="shrink-0 rounded-lg p-2 text-muted transition hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

// 비포애프터 사진 자가입력(M2) — 압축→비공개버킷 업로드→member_photo insert. 열람은 서명 URL(1h).
// 회원은 본인 폴더만(스토리지 RLS). 업로드 전 반드시 compressImage(원본 금지).
function PhotoSection({ me, photos, onReload, mode }) {
  const [label, setLabel] = useState("progress");
  const [takenOn, setTakenOn] = useState(() => todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [urls, setUrls] = useState({}); // storage_path -> signed url (1h)
  const [lightbox, setLightbox] = useState(null);

  // photos 변경 시 서명 URL 일괄 재생성(만료 1h · 재조회마다 갱신).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!memberSupabase || photos.length === 0) { if (!cancelled) setUrls({}); return; }
      const { data } = await memberSupabase.storage
        .from("member-photos")
        .createSignedUrls(photos.map((p) => p.storage_path), 3600);
      if (cancelled) return;
      const map = {};
      (data || []).forEach((d) => { if (d.signedUrl) map[d.path] = d.signedUrl; });
      setUrls(map);
    })();
    return () => { cancelled = true; };
  }, [photos]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file || busy) return;
    if (!memberSupabase) { setErr("데모 모드 — 실제 업로드는 불가해요."); return; }
    if (!me?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시 시도하세요."); return; }
    setBusy(true); setErr("");
    // 1) 업로드 전 압축(필수) — 원본 그대로 올리지 않음.
    let blob;
    try {
      blob = await compressImage(file);
    } catch {
      setBusy(false);
      setErr("이 사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.");
      return;
    }
    // 2) 비공개 버킷 업로드({me.id}/{uuid}.jpg — 첫 폴더가 RLS 스코프 키).
    const path = `${me.id}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await memberSupabase.storage
      .from("member-photos")
      .upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) {
      setBusy(false);
      setErr("업로드에 실패했어요: " + upErr.message);
      return;
    }
    // 3) DB insert(하드닝) — 실패 시 방금 올린 파일 롤백(고아 방지).
    const { data, error } = await memberSupabase
      .from("member_photo")
      .insert({ user_id: me.id, storage_path: path, label, taken_on: takenOn })
      .select();
    if (error || !data || data.length === 0) {
      await memberSupabase.storage.from("member-photos").remove([path]);
      setBusy(false);
      setErr("기록 저장에 실패했어요" + (error ? ": " + error.message : " (0행)"));
      return;
    }
    await onReload();
    setBusy(false);
  };

  const remove = async (photo) => {
    if (busy) return;
    if (!memberSupabase) return;
    setBusy(true); setErr("");
    const { data, error } = await memberSupabase
      .from("member_photo")
      .delete()
      .eq("id", photo.id)
      .select(); // 하드닝: 0행이면 실패
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("삭제에 실패했어요" + (error ? ": " + error.message : " (0행)"));
      return;
    }
    await memberSupabase.storage.from("member-photos").remove([photo.storage_path]); // 스토리지 파일도 정리
    await onReload();
    setBusy(false);
  };

  const inputCls =
    "mt-1 w-full min-w-0 rounded-lg border border-line bg-elevate px-3 py-2.5 text-base text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  return (
    <>
    <section className="mb-8">
      <Eyebrow icon={Camera}>비포애프터 사진</Eyebrow>
      {mode !== "list" && (
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-1 min-w-0 text-xs font-medium text-muted">
            분류
            <select value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} className={inputCls}>
              <option value="before">비포</option>
              <option value="progress">진행</option>
              <option value="after">애프터</option>
            </select>
          </label>
          <label className="col-span-1 min-w-0 text-xs font-medium text-muted">
            날짜
            <input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} disabled={busy} className={inputCls} />
          </label>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <label className={`mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-4 py-3 text-base font-semibold text-white ${busy ? "opacity-60" : ""}`}>
          <ImagePlus className="h-5 w-5" /> {busy ? "올리는 중…" : "사진 올리기"}
          <input type="file" accept="image/*" onChange={onPick} disabled={busy} className="hidden" />
        </label>
      </div>
      )}

      {/* 갤러리 — 내 기록 탭에서만(mode=list) */}
      {mode !== "form" && (photos.length === 0 ? (
        <EmptyState className="mt-3 rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
          아직 사진이 없어요. 비포 사진부터 남겨보세요.
        </EmptyState>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded-2xl border border-line bg-elevate shadow-sm">
              <div className="aspect-square">
                {urls[p.storage_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    src={urls[p.storage_path]}
                    alt={PHOTO_LABELS[p.label] || "사진"}
                    onClick={() => setLightbox(urls[p.storage_path])}
                    className="h-full w-full cursor-pointer object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">불러오는 중…</div>
                )}
              </div>
              {p.label && (
                <span className="absolute left-2 top-2 rounded-md bg-card/85 px-2 py-0.5 text-[11px] font-semibold text-sub">
                  {PHOTO_LABELS[p.label] || p.label}
                </span>
              )}
              <span className="absolute bottom-2 left-2 rounded-md bg-card/85 px-2 py-0.5 text-[11px] text-sub">
                {fmtDay(p.taken_on)}
              </span>
              <button
                onClick={() => remove(p)}
                disabled={busy}
                className="absolute right-2 top-2 rounded-lg bg-card/85 p-1.5 text-muted transition hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ))}
    </section>
    <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

// 개인운동 기록 자가입력(M3) — 회원은 개인운동만 기록(kind="personal" 고정).
// PT 받은 날은 수업로그로 자동 체크되므로 회원 입력에서 PT 구분 제거.
function ScheduleSection({ me, schedule, onReload, mode }) {
  const [on, setOn] = useState(() => todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const inputCls =
    "mt-1 w-full min-w-0 rounded-lg border border-line bg-elevate px-3 py-2.5 text-base text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  const add = async () => {
    if (busy) return;
    if (!memberSupabase) { setErr("데모 모드 — 실제 기록은 불가해요."); return; }
    if (!me?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시 시도하세요."); return; }
    if (!on) { setErr("날짜를 선택하세요."); return; }
    setBusy(true); setErr("");
    // 하드닝: .select()로 반환 확인 — 0행이면 실패(RLS/정책). kind는 personal 고정.
    const { data, error } = await memberSupabase
      .from("schedule_check")
      .insert({ user_id: me.id, on_date: on, kind: "personal", note: note.trim() || null })
      .select();
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("기록 저장에 실패했어요" + (error ? ": " + error.message : " (0행)"));
      return;
    }
    setNote(""); // 날짜는 유지(연속 입력 편의)
    await onReload();
    setBusy(false);
  };

  const remove = async (id) => {
    if (busy) return;
    if (!memberSupabase) return;
    setBusy(true); setErr("");
    const { data, error } = await memberSupabase
      .from("schedule_check")
      .delete()
      .eq("id", id)
      .select(); // 하드닝: 0행이면 실패
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("삭제에 실패했어요" + (error ? ": " + error.message : " (0행)"));
      return;
    }
    await onReload();
    setBusy(false);
  };

  return (
    <section className="mb-8">
      <Eyebrow icon={CalendarCheck}>개인운동 기록</Eyebrow>
      {mode !== "list" && (
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            날짜
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} disabled={busy} className={inputCls} />
          </label>
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            오늘 한 운동
            <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} rows={3} placeholder="예: 가슴·등 / 벤치프레스 40kg 5×5 / 컨디션 좋았음" className={`${inputCls} resize-none`} />
          </label>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <div className="mt-3">
          <Button variant="primary" size="md" fullWidth onClick={add} disabled={busy}>
            <Plus className="h-4 w-4" /> {busy ? "저장 중…" : "기록"}
          </Button>
        </div>
      </div>
      )}

      {/* 목록 — 내 기록 탭에서만(mode=list) */}
      {mode !== "form" && (schedule.length === 0 ? (
        <EmptyState className="mt-3 rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
          아직 개인운동 기록이 없어요. 오늘 한 운동을 남겨보세요.
        </EmptyState>
      ) : (
        <ul className="mt-3 space-y-2">
          {schedule.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-primary-strong">{fmtDay(s.on_date)}</div>
                {s.note && <div className="mt-1 whitespace-pre-wrap text-base text-ink">{s.note}</div>}
              </div>
              <button
                onClick={() => remove(s.id)}
                disabled={busy}
                className="shrink-0 rounded-lg p-2 text-muted transition hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

// 운동 달력 — 이미 로드된 logs·cardio·schedule 파생(추가 쿼리 0). 날짜별 마커 점(겹치면 다 표시).
function MemberActivityCalendar({ logs, cardio, schedule }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(null); // 선택한 날짜 키 · null이면 상세 없음
  const activityMap = useMemo(() => buildActivityMap(logs, cardio, schedule), [logs, cardio, schedule]);

  const first = new Date(cursor.y, cursor.m, 1);
  const startWeekday = first.getDay();                 // 0=일
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const prevMonth = () => setCursor((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const nextMonth = () => setCursor((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayKey = ymd(new Date());
  const keyFor = (day) => `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // 선택일 상세 파생(그 날짜 매칭).
  const detail = selected
    ? {
        pt: (logs || []).some((l) => { const iso = l.session_at ?? l.created_at; return iso && ymd(new Date(iso)) === selected; })
          || (schedule || []).some((s) => s.on_date === selected && s.kind === "pt"),
        personals: (schedule || []).filter((s) => s.on_date === selected && s.kind === "personal"),
        cardios: (cardio || []).filter((c) => c.performed_on === selected),
      }
    : null;
  const detailEmpty = detail && !detail.pt && !detail.personals.length && !detail.cardios.length;

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <section className="mb-8">
      <Eyebrow icon={CalendarDays}>운동 달력</Eyebrow>
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <button onClick={prevMonth} aria-label="이전 달" className="rounded-lg p-2 text-muted transition hover:text-ink">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-base font-bold text-ink">{cursor.y}년 {cursor.m + 1}월</div>
          <button onClick={nextMonth} aria-label="다음 달" className="rounded-lg p-2 text-muted transition hover:text-ink">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {/* 요일 — 일(빨강)·토(파랑) */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
          {WEEKDAYS.map((w, i) => <div key={w} className={`py-1 ${i === 0 ? "text-rose-600" : i === 6 ? "text-sky-500" : ""}`}>{w}</div>)}
        </div>
        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={`e${i}`} />;
            const key = keyFor(day);
            const set = activityMap[key];
            const active = Boolean(set);
            const isToday = key === todayKey;
            const col = i % 7;                 // 0=일 · 6=토
            const hol = holidayName(key);
            const dayTone = isToday
              ? "font-bold text-primary-strong"
              : (col === 0 || hol) ? "text-rose-600"
              : col === 6 ? "text-sky-500"
              : "text-ink";
            return (
              <button
                key={key}
                onClick={() => active && setSelected(key === selected ? null : key)}
                disabled={!active}
                title={hol || undefined}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm ${active ? "cursor-pointer bg-elevate" : ""} ${key === selected ? "ring-2 ring-primary" : isToday ? "ring-1 ring-primary" : ""}`}
              >
                <span className={dayTone}>{day}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {set && MARK_ORDER.filter((t) => set.has(t)).map((t) => (
                    <span key={t} className={`h-1.5 w-1.5 rounded-full ${ACTIVITY_MARKS[t].dot}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {/* 범례 */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
          {MARK_ORDER.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${ACTIVITY_MARKS[t].dot}`} /> {ACTIVITY_MARKS[t].label}
            </span>
          ))}
        </div>
      </div>

      {/* 선택일 상세 */}
      {selected && (
        <div className="mt-2 rounded-2xl border border-line bg-card p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-primary-strong">{fmtDay(selected)}</div>
          {detailEmpty ? (
            <p className="text-sm text-muted">기록 없음</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {detail.pt && (
                <li className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ACTIVITY_MARKS.pt.dot}`} />
                  <span className="text-ink">PT 수업</span>
                </li>
              )}
              {detail.personals.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ACTIVITY_MARKS.personal.dot}`} />
                  <span className="text-ink">개인운동{s.note ? <span className="text-muted"> · {s.note}</span> : null}</span>
                </li>
              ))}
              {detail.cardios.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ACTIVITY_MARKS.cardio.dot}`} />
                  <span className="text-ink">{c.kind || "유산소"}{c.minutes != null ? <span className="text-muted"> · {c.minutes}분</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function HomeView({ me, logs, inbody, cardio, onReloadCardio, photos, onReloadPhotos, schedule, onReloadSchedule, onSignOut }) {
  const [subTab, setSubTab] = useState("read"); // read=내 기록(첫 화면) · write=기록 남기기
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-ink">정보를 불러오지 못했어요</div>
          <p className="mt-2 text-sm text-muted">다시 로그인해 주세요.</p>
          <div className="mt-4">
            <Button variant="ghost" size="md" fullWidth onClick={onSignOut}>다시 로그인</Button>
          </div>
        </div>
      </div>
    );
  }

  const latest = inbody.length ? inbody[inbody.length - 1] : null;
  const prev = inbody.length > 1 ? inbody[inbody.length - 2] : null;

  // 종목별 무게 추이 — 무게 point가 하나라도 있는 종목만(맨몸만 있는 종목 제외). 추가 쿼리 0(logs 재사용).
  const exerciseSeries = buildExerciseSeries(logs).filter((s) =>
    s.points.some((p) => p.topWeight != null)
  );
  const EX_TOP = 5; // 기본 펼침 개수(최근 활동순)
  const exImproved = exerciseSeries.filter((s) => {
    const w = s.points.filter((p) => p.topWeight != null);
    return w.length > 1 && w[w.length - 1].topWeight > w[0].topWeight;
  }).length;

  // 종목 1개 = 컴팩트 한 행(종목명 · Sparkline · 최신무게·직전대비 delta).
  const renderExerciseRow = (ex) => {
    const wpts = ex.points.filter((p) => p.topWeight != null);
    const cur = wpts[wpts.length - 1]?.topWeight ?? null;
    const before = wpts.length > 1 ? wpts[wpts.length - 2].topWeight : null;
    const d = before != null && cur != null ? cur - before : 0;
    const tone = weightTone(d);
    const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
    return (
      <li key={ex.exercise} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 shadow-sm">
        <span className="w-24 shrink-0 truncate text-sm font-semibold text-ink">{ex.exercise}</span>
        <div className="min-w-0 flex-1"><Sparkline values={ex.points.map((p) => p.topWeight)} /></div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-base font-bold leading-none text-ink">
            {cur == null ? "–" : cur}<span className="ml-0.5 text-[10px] font-normal text-muted">kg</span>
          </div>
          {before != null && cur != null && (
            <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-[11px] font-semibold ${DELTA_TONE[tone]}`}>
              <Icon className="h-3 w-3" />{fmtDelta(d)}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="min-h-screen bg-bg pb-16 text-ink antialiased">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {/* 프로필 헤더 */}
        <header className="mb-6">
          {/* 브랜드 바 — 로고 + 오직 트레이너 */}
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="오직 트레이너" className="h-7 w-7 rounded-lg" />
            <Wordmark className="text-[11px] font-bold tracking-[0.18em]" />
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-ink">
            {me.name} <span className="text-lg font-semibold text-muted">회원님 공간</span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-sub">
            {me.goal && <span className="rounded-full bg-elevate px-3 py-1">목표 · {me.goal}</span>}
            {me.goal_deadline && <span className="rounded-full bg-elevate px-3 py-1">시점 · {me.goal_deadline}</span>}
            {me.trainer_name && <span className="rounded-full bg-elevate px-3 py-1">담당 · {me.trainer_name} 트레이너</span>}
          </div>
        </header>

        {/* 서브 탭 — 내 기록(열람) / 기록 남기기(입력). 내 기록이 첫 화면. */}
        <div className="mb-6 flex gap-1.5">
          <button onClick={() => setSubTab("read")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${subTab === "read" ? "bg-primary-soft text-primary-strong ring-1 ring-primary/30" : "bg-elevate text-muted"}`}>내 기록</button>
          <button onClick={() => setSubTab("write")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${subTab === "write" ? "bg-primary-soft text-primary-strong ring-1 ring-primary/30" : "bg-elevate text-muted"}`}>기록 남기기</button>
        </div>

        {subTab === "read" && (
          <>
        {/* 운동 달력 — 이미 로드된 logs·cardio·schedule 파생(추가 쿼리 없음). 한눈 개요 먼저. */}
        <MemberActivityCalendar logs={logs} cardio={cardio} schedule={schedule} />

        {/* 수업일지 타임라인 */}
        <section className="mb-8">
          <Eyebrow icon={NotebookPen}>내 수업일지</Eyebrow>
          {logs.length === 0 ? (
            <EmptyState className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
              아직 기록된 수업일지가 없어요.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {logs.map((l, i) => {
                const round = logs.length - i; // 최신순 배열 → 오래된 게 1회차(누적)
                return (
                  <li key={l.id}>
                    <details className="group rounded-2xl border border-line bg-card p-4 shadow-sm">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-primary-strong">{fmtDay(l.created_at)}</span>
                          <span className="rounded-full bg-elevate px-2 py-0.5 text-[11px] font-semibold text-sub">{round}회차</span>
                          {l.ai_summary && (
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                          )}
                        </div>
                        {l.ai_summary ? (
                          <p className="mt-1.5 text-sm text-sub line-clamp-1 group-open:hidden">{l.ai_summary}</p>
                        ) : (
                          <p className="mt-1.5 text-sm text-muted">상세 내용이 없어요.</p>
                        )}
                      </summary>
                      {l.ai_summary && (
                        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{l.ai_summary}</p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 인바디 추이 */}
        <section className="mb-8">
          <Eyebrow icon={Scale}>인바디 변화</Eyebrow>
          {!latest ? (
            <EmptyState className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
              아직 인바디 기록이 없어요.
            </EmptyState>
          ) : (
            <>
              <div className="mb-2 text-xs text-muted">최근 측정 · {fmtDay(latest.measured_at)}{prev ? " (직전 대비)" : ""}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {INBODY_FIELDS.map((f) => {
                  const cur = latest[f.key];
                  const before = prev?.[f.key];
                  const tone = deltaTone(f, cur, before);
                  const d = tone && before != null ? cur - before : 0;
                  const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
                  return (
                    <div key={f.key} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-wider text-muted">{f.label}</div>
                      <div className="mt-1 font-mono text-2xl font-bold text-ink">
                        {cur == null ? "–" : cur}
                        <span className="ml-1 text-xs font-normal text-muted">{f.unit}</span>
                      </div>
                      {tone && (
                        <div className={`mt-1 flex items-center gap-1 text-[13px] font-semibold ${DELTA_TONE[tone]}`}>
                          <Icon className="h-3.5 w-3.5" /> {fmtDelta(d)}{f.unit}
                        </div>
                      )}
                      <Sparkline values={inbody.map((r) => r[f.key])} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* 종목별 무게 변화 (③ Phase 2) — 컴팩트 행. 상위 EX_TOP개만 펼치고 나머지는 '더 보기'.
            0이면 섹션 미렌더. 공용 buildExerciseSeries·Sparkline 재사용. */}
        {exerciseSeries.length > 0 && (
          <section className="mb-8">
            <Eyebrow icon={Dumbbell}>종목별 무게 변화</Eyebrow>
            {exImproved > 0 && (
              <p className="mb-2 text-sm text-primary-strong">무게가 오른 종목이 {exImproved}개예요. 잘하고 있어요!</p>
            )}
            <ul className="space-y-2">{exerciseSeries.slice(0, EX_TOP).map(renderExerciseRow)}</ul>
            {exerciseSeries.length > EX_TOP && (
              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-1 py-1 text-xs font-medium text-muted [&::-webkit-details-marker]:hidden">
                  나머지 {exerciseSeries.length - EX_TOP}개 더 보기
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="mt-2 space-y-2">{exerciseSeries.slice(EX_TOP).map(renderExerciseRow)}</ul>
              </details>
            )}
          </section>
        )}

        {/* 회원 입력 기록 열람 — 기록 남기기에 저장한 것도 여기 모아 보기(목록만). */}
        <ScheduleSection me={me} schedule={schedule} onReload={onReloadSchedule} mode="list" />
        <CardioSection me={me} cardio={cardio} onReload={onReloadCardio} mode="list" />
        <PhotoSection me={me} photos={photos} onReload={onReloadPhotos} mode="list" />
          </>
        )}

        {subTab === "write" && (
          <>
        {/* 개인운동 기록(M3) — 폼만(목록은 내 기록 탭). */}
        <ScheduleSection me={me} schedule={schedule} onReload={onReloadSchedule} mode="form" />

        {/* 유산소 기록(M1) — 폼만. */}
        <CardioSection me={me} cardio={cardio} onReload={onReloadCardio} mode="form" />

        {/* 비포애프터 사진(M2) — 폼만. */}
        <PhotoSection me={me} photos={photos} onReload={onReloadPhotos} mode="form" />
          </>
        )}

        {/* 로그아웃 */}
        <div className="text-center">
          <button onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted transition hover:text-ink">
            <LogOut className="h-3.5 w-3.5" /> 로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemberHome() {
  const { token } = useParams();
  const [phase, setPhase] = useState("checking"); // checking | login | home
  const [me, setMe] = useState(null);
  const [logs, setLogs] = useState([]);
  const [inbody, setInbody] = useState([]);
  const [cardio, setCardio] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 유산소만 재조회(insert/delete 후 목록 갱신용).
  const loadCardio = useCallback(async () => {
    if (!memberSupabase) return;
    const { data } = await memberSupabase
      .from("cardio_log")
      .select("*")
      .order("performed_on", { ascending: false })
      .limit(30);
    setCardio(data ?? []);
  }, []);

  // 사진만 재조회(업로드/삭제 후 갱신용).
  const loadPhotos = useCallback(async () => {
    if (!memberSupabase) return;
    const { data } = await memberSupabase
      .from("member_photo")
      .select("*")
      .order("taken_on", { ascending: false })
      .limit(60);
    setPhotos(data ?? []);
  }, []);

  // 스케줄만 재조회(추가/삭제 후 갱신용).
  const loadSchedule = useCallback(async () => {
    if (!memberSupabase) return;
    const { data } = await memberSupabase
      .from("schedule_check")
      .select("*")
      .order("on_date", { ascending: false })
      .limit(60);
    setSchedule(data ?? []);
  }, []);

  const loadHome = useCallback(async () => {
    if (!memberSupabase) return;
    try {
      const [meRes, logRes, inbodyRes, cardioRes, photoRes, schedRes] = await Promise.all([
        memberSupabase.from("member_me").select("*").maybeSingle(),
        memberSupabase.from("member_workout_log").select("*").order("created_at", { ascending: false }),
        memberSupabase.from("member_inbody").select("*").order("measured_at", { ascending: true }),
        memberSupabase.from("cardio_log").select("*").order("performed_on", { ascending: false }).limit(30),
        memberSupabase.from("member_photo").select("*").order("taken_on", { ascending: false }).limit(60),
        memberSupabase.from("schedule_check").select("*").order("on_date", { ascending: false }).limit(60),
      ]);
      setMe(meRes.data ?? null);
      setLogs(logRes.data ?? []);
      setInbody(inbodyRes.data ?? []);
      setCardio(cardioRes.data ?? []);
      setPhotos(photoRes.data ?? []);
      setSchedule(schedRes.data ?? []);
      setPhase("home");
    } catch {
      setPhase("home"); // 부분 실패해도 빈 상태로 진입(me null → 재로그인 안내 카드) — 무한 스피너 방지
    }
  }, []);

  // 기존 세션 있으면 바로 홈, 없으면 로그인. setState는 async IIFE 안에서(set-state-in-effect 회피).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!memberSupabase) { if (alive) setPhase("login"); return; }
      try {
        const { data } = await memberSupabase.auth.getSession();
        if (!alive) return;
        if (data.session) loadHome();
        else setPhase("login");
      } catch { if (alive) setPhase("login"); } // 세션 조회 실패 → 로그인 화면(무한 스피너 방지)
    })();
    return () => { alive = false; };
  }, [loadHome]);

  const submit = async () => {
    if (busy) return;
    if (!memberSupabase) { setErr("데모 모드 — 키가 없어 로그인할 수 없어요."); return; }
    if (!/^\d{4}$/.test(last4)) { setErr("휴대폰 뒤 4자리를 입력하세요."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/member-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phoneLast4: last4 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) { setErr(json.error || "확인에 실패했습니다."); setBusy(false); return; }
      await memberSupabase.auth.setSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
      });
      await loadHome();
    } catch {
      setErr("네트워크 오류. 잠시 후 다시 시도하세요.");
    }
    setBusy(false);
  };

  const signOut = async () => {
    if (memberSupabase) await memberSupabase.auth.signOut();
    setMe(null); setLogs([]); setInbody([]); setCardio([]); setPhotos([]); setSchedule([]); setLast4(""); setPhase("login");
  };

  if (phase === "checking") return <ScreenMsg>불러오는 중…</ScreenMsg>;
  if (phase === "login")
    return <LoginCard last4={last4} setLast4={setLast4} onSubmit={submit} busy={busy} err={err} />;
  return <HomeView me={me} logs={logs} inbody={inbody} cardio={cardio} onReloadCardio={loadCardio} photos={photos} onReloadPhotos={loadPhotos} schedule={schedule} onReloadSchedule={loadSchedule} onSignOut={signOut} />;
}

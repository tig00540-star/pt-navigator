"use client";

/* =========================================================================
   회원 홈 (/m/<member_token>) — 읽기전용. 끝4 로그인(S1 라우트) → setSession →
   안전 뷰 3개(member_me·member_workout_log·member_inbody) 조회. 자가입력 없음·매출요소 0.
   트레이너 앱과 같은 토큰(bg·card·ink·line·primary)이되 회원용이라 글씨 크게·정보 밀도 낮게.
   ========================================================================= */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { NotebookPen, Scale, Dumbbell, TrendingUp, TrendingDown, Minus, LogOut, ChevronDown, Activity, Plus, Trash2, Camera, ImagePlus, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Flame, Trophy, Sparkles } from "lucide-react";
import { memberSupabase } from "@/lib/memberSupabase";
import MyPtCard from "@/components/member/MyPtCard";
import RoutineSection from "@/components/member/RoutineSection";
import ConsentGate from "@/components/member/ConsentGate";
import MemberFooter from "@/components/member/MemberFooter";
import { CONSENT_VERSION, latestConsent } from "@/lib/consent";
import { INBODY_FIELDS } from "@/lib/labels";
import { holidayName } from "@/lib/holidays";
import { buildExerciseSeries } from "@/lib/workout";
import { compressImage } from "@/lib/image";
import { confirmDue } from "@/lib/workoutHash";
import Wordmark from "@/components/ui/Wordmark";
import Eyebrow from "@/components/ui/Eyebrow";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import Sparkline from "@/components/ui/Sparkline";
import ImageLightbox from "@/components/ui/ImageLightbox";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

// 수업일지 확인 소프트 모달을 띄우는 미확인 건수 임계값(이 이상이면 로그인 직후 1회 모달 유도).
const CONFIRM_MODAL_THRESHOLD = 1;   // 2026-10-06 대표: 1건만 있어도 들어오자마자 확인 창

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

/* 오운완 뱃지 티어 — 정적 const(purge-safe · 동적 조립 금지).
   앞쪽을 촘촘하게: 도달 못 할 뱃지가 흐리게 오래 떠 있으면 동기부여가 아니라 좌절 신호가 된다.
   kind: total=누적 오운완일 · streak=연속일. trainer_reward(트레이너 커스텀 포상)와는 별개 축. */
const OUNWAN_BADGES = [
  { key: "first",    label: "첫 오운완", need: 1,  kind: "total"  },
  { key: "flame7",   label: "불꽃 7일",  need: 7,  kind: "streak" },
  { key: "steady10", label: "꾸준 10회", need: 10, kind: "total"  },
  { key: "steady30", label: "든든 30회", need: 30, kind: "total"  },
  { key: "gold60",   label: "골드 60회", need: 60, kind: "total"  },
];

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
// 기록 날짜는 그제까지만(오운완 몰아 채우기 방지 · 대표 결정 2026-10-06 · DB 정책도 같은 조건).
function dayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const EARLIEST_DAYS = -2;

// 운동일지의 종목 · 세트(sets_structured) → 사람이 읽는 줄들. 글 요약이 없을 때도 수업 내용을 보여 주려고(2026-10-06).
function setLines(l) {
  const list = Array.isArray(l?.sets_structured) ? l.sets_structured : [];
  return list.filter((e) => e && e.exercise).map((e) => {
    const sets = (Array.isArray(e.sets) ? e.sets : []).filter((s) => s && (s.weight != null || s.reps != null));
    const body = sets.map((s) => `${s.weight != null && s.weight !== "" ? `${s.weight}kg` : "맨몸"}×${s.reps ?? "–"}`).join(" · ");
    return { name: e.exercise, body };
  });
}

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
function CardioSection({ me, cardio, onReload, mode, readOnly = false }) {
  const [on, setOn] = useState(() => todayStr());
  const [kind, setKind] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { toast, showToast } = useToast();

  const inputCls =
    "mt-1 w-full min-w-0 rounded-lg border border-line bg-elevate px-3 py-2.5 text-base text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  const add = async () => {
    if (busy) return;
    if (!memberSupabase) { setErr("데모 모드라 실제로 기록되지 않아요."); return; }
    if (!me?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요."); return; }
    if (!on) { setErr("날짜를 선택해 주세요."); return; }
    if (on < dayStr(EARLIEST_DAYS) || on > dayStr(0)) { setErr("오늘 · 어제 · 그제 기록만 남길 수 있어요."); return; }
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
      setErr("기록을 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    setKind(""); setMinutes(""); setNote(""); // 날짜는 유지(연속 입력 편의)
    showToast("유산소 기록을 저장했어요");
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
      setErr("삭제하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    showToast("기록을 삭제했어요");
    await onReload();
    setBusy(false);
  };

  return (
    <section className="mb-8">
      <Eyebrow icon={Activity}>유산소 기록</Eyebrow>
      {mode !== "list" && (
      <Card padding="sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            날짜
            <input type="date" value={on} min={dayStr(EARLIEST_DAYS)} max={dayStr(0)} onChange={(e) => setOn(e.target.value)} disabled={busy} className={inputCls} />
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
      </Card>
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
              {!readOnly && (
              <button
                onClick={() => remove(c.id)}
                disabled={busy}
                className="shrink-0 rounded-lg p-2 text-muted transition hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              )}
            </li>
          ))}
        </ul>
      ))}
      <Toast message={toast} />
    </section>
  );
}

// 비포애프터 사진 자가입력(M2) — 압축→비공개버킷 업로드→member_photo insert. 열람은 서명 URL(1h).
// 회원은 본인 폴더만(스토리지 RLS). 업로드 전 반드시 compressImage(원본 금지).
function PhotoSection({ me, photos, onReload, mode, readOnly = false }) {
  const [label, setLabel] = useState("progress");
  const [takenOn, setTakenOn] = useState(() => todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [urls, setUrls] = useState({}); // storage_path -> signed url (1h)
  const [lightbox, setLightbox] = useState(null);
  const { toast, showToast } = useToast();

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
    if (!memberSupabase) { setErr("데모 모드라 실제로 올라가지 않아요."); return; }
    if (!me?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요."); return; }
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
      console.error("사진 업로드 실패", upErr);
      setErr("사진을 올리지 못했어요. 다시 시도해 주세요.");
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
      setErr("기록을 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    showToast("사진을 저장했어요");
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
      setErr("삭제하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    await memberSupabase.storage.from("member-photos").remove([photo.storage_path]); // 스토리지 파일도 정리
    showToast("사진을 삭제했어요");
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
      <Card padding="sm">
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
      </Card>
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
              {!readOnly && (
              <button
                onClick={() => remove(p)}
                disabled={busy}
                className="absolute right-2 top-2 rounded-lg bg-card/85 p-1.5 text-muted transition hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
    <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    <Toast message={toast} />
    </>
  );
}

// 개인운동 기록 자가입력(M3) — 회원은 개인운동만 기록(kind="personal" 고정).
// PT 받은 날은 수업로그로 자동 체크되므로 회원 입력에서 PT 구분 제거.
function ScheduleSection({ me, schedule, onReload, mode, readOnly = false }) {
  const [on, setOn] = useState(() => todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { toast, showToast } = useToast();

  const inputCls =
    "mt-1 w-full min-w-0 rounded-lg border border-line bg-elevate px-3 py-2.5 text-base text-ink placeholder-muted outline-none focus:border-primary disabled:opacity-50";

  const add = async () => {
    if (busy) return;
    if (!memberSupabase) { setErr("데모 모드라 실제로 기록되지 않아요."); return; }
    if (!me?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요."); return; }
    if (!on) { setErr("날짜를 선택해 주세요."); return; }
    if (on < dayStr(EARLIEST_DAYS) || on > dayStr(0)) { setErr("오늘 · 어제 · 그제 기록만 남길 수 있어요."); return; }
    setBusy(true); setErr("");
    // 하드닝: .select()로 반환 확인 — 0행이면 실패(RLS/정책). kind는 personal 고정.
    const { data, error } = await memberSupabase
      .from("schedule_check")
      .insert({ user_id: me.id, on_date: on, kind: "personal", note: note.trim() || null })
      .select();
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("기록을 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    setNote(""); // 날짜는 유지(연속 입력 편의)
    showToast("기록을 저장했어요");
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
      setErr("삭제하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    showToast("기록을 삭제했어요");
    await onReload();
    setBusy(false);
  };

  return (
    <section className="mb-8">
      <Eyebrow icon={CalendarCheck}>개인운동 기록</Eyebrow>
      {mode !== "list" && (
      <Card padding="sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 min-w-0 text-xs font-medium text-muted">
            날짜
            <input type="date" value={on} min={dayStr(EARLIEST_DAYS)} max={dayStr(0)} onChange={(e) => setOn(e.target.value)} disabled={busy} className={inputCls} />
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
      </Card>
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
              {!readOnly && (
              <button
                onClick={() => remove(s.id)}
                disabled={busy}
                className="shrink-0 rounded-lg p-2 text-muted transition hover:text-rose-600 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              )}
            </li>
          ))}
        </ul>
      ))}
      <Toast message={toast} />
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
      <Card padding="sm">
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
      </Card>

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

/* 오운완 카드 — '내 기록' 최상단. 회원이 제일 먼저 보는 성취 화면.
   ⚠️ 누적(total)·연속(streak)은 반드시 서버 RPC(ounwan_stats) 값만 쓴다.
      loadHome의 조회는 limit(30/60)이 걸려 있어 buildActivityMap을 세면 누적이 창에 갇히고,
      기록이 쌓일수록 옛 날짜가 밀려나 '누적이 줄어드는' 현상이 생긴다(성취 화면에선 치명적).
      buildActivityMap은 '오늘 했는지' 판정에만 쓴다 — 오늘은 항상 최근 창 안이라 정확. */
function OunwanCard({ stats, rewards, todayDone, onGoWrite }) {
  const total = stats?.total ?? 0;
  const streak = stats?.streak ?? 0;
  const monthCount = stats?.month_count ?? 0;
  const earned = (b) => (b.kind === "streak" ? streak >= b.need : total >= b.need);

  return (
    <section className="mb-8 rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Flame className={`h-5 w-5 ${todayDone ? "text-primary" : "text-muted"}`} />
        <span className="text-base font-bold text-ink">
          {todayDone ? `오늘 오운완 완료!` : "오늘은 아직이에요"}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-sub">
        {todayDone
          ? streak > 1 ? `${streak}일 연속으로 해내고 있어요 🔥` : "오늘도 몸을 움직였어요 👏"
          : "운동을 기록하면 오늘 오운완이 채워져요."}
      </p>
      {!todayDone && onGoWrite && (
        <button
          onClick={onGoWrite}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition active:scale-95"
        >
          기록 남기러 가기
        </button>
      )}

      <div className="mt-4 flex items-center gap-4 border-t border-line pt-4">
        <div>
          <div className="text-[11px] text-muted">이번 달</div>
          <div className="text-xl font-extrabold text-ink">{monthCount}<span className="ml-0.5 text-sm font-bold text-muted">회</span></div>
        </div>
        <div>
          <div className="text-[11px] text-muted">누적</div>
          <div className="text-xl font-extrabold text-ink">{total}<span className="ml-0.5 text-sm font-bold text-muted">회</span></div>
        </div>
        <div>
          <div className="text-[11px] text-muted">연속</div>
          <div className="text-xl font-extrabold text-ink">{streak}<span className="ml-0.5 text-sm font-bold text-muted">일</span></div>
        </div>
      </div>

      {/* 뱃지 — 획득은 레드 강조, 미획득은 흐리게(정적 클래스 분기) */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {OUNWAN_BADGES.map((b) => (
          <span
            key={b.key}
            className={
              earned(b)
                ? "inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-strong ring-1 ring-primary/30"
                : "inline-flex items-center gap-1 rounded-full bg-elevate px-2.5 py-1 text-[11px] font-medium text-muted"
            }
          >
            {earned(b) && <Sparkles className="h-3 w-3" />}
            {b.label}
          </span>
        ))}
      </div>

      {/* 트레이너 포상 — 정의된 게 있을 때만. 데모/0건이면 통째로 숨김. */}
      {rewards.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-primary-strong" />
            <span className="text-xs font-bold text-sub">트레이너 포상</span>
          </div>
          {rewards.map((r) => {
            const done = total >= r.milestone;
            const pct = Math.min(100, Math.round((total / Math.max(1, r.milestone)) * 100));
            return (
              <div key={r.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{r.reward_text}</span>
                  <span className="shrink-0 text-[11px] text-muted">{total}/{r.milestone}회</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevate">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                {done && <div className="mt-1 text-[11px] font-bold text-primary-strong">달성! 트레이너에게 받으세요 🎉</div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* 수업일지 회원 확인 — 소프트 유도(스펙 §4).
   진실은 확인 레코드(서버)다. 이건 UX 유도일 뿐 — 회원을 절대 락아웃하지 않는다.
   ⚠️ fail-open: member-confirm이 503(데모/키부재)이면 큐를 통째로 끈다(아래 disabledByServer).
   ⚠️ pending 계산은 뷰가 주는 confirmed_at에 의존 — confirm 확정분은 제외되고(확인 전용 · dispute 제거),
      수업 시작 1시간 뒤부터 뜬다(confirmDue · 2026-10-06 · 옛: 다음 날부터). */
function ConfirmFlow({ logs, onReload }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [serverOff, setServerOff] = useState(false);  // member-confirm 503 → 유도 전체 끔(fail-open)

  const [nowMs] = useState(() => Date.now());   // 페이지를 연 시각 기준(수업 1시간 뒤부터)
  const pending = useMemo(
    () => (logs || []).filter((l) => !l.confirmed_at && confirmDue(l, nowMs)),
    [logs, nowMs]
  );

  // 미확인이 있으면 페이지를 열 때마다 확인 창이 먼저 뜬다(2026-10-06 · 옛: 3건 이상 · '나중에' 누르면 그날 안 뜸).
  //   닫기는 '확인했어요' · '나중에 할게요' 두 버튼만(✕ · 바깥 누르기 · ESC 없음 = blocking) — 한 번은 읽고 고르게.
  //   '나중에'가 있어 강제는 아니다(스스로 고른 확인이어야 서명 대신으로 힘이 있다).
  // ⚠️ setState는 async IIFE 안에서(레포 규율: react-hooks/set-state-in-effect 회피 · AuthGate 패턴).
  const [autoShown, setAutoShown] = useState(false); // 진입 시 1회만 자동으로 뜨게(수동 배너 재열기와 별개)
  useEffect(() => {
    if (serverOff || autoShown) return;
    if (pending.length < CONFIRM_MODAL_THRESHOLD) return;
    let alive = true;
    (async () => {
      if (!alive) return;
      setAutoShown(true);
      setModalOpen(true);
    })();
    return () => { alive = false; };
  }, [serverOff, autoShown, pending.length]);

  // 확인 전용 — result는 "confirm" 고정(이의 제거). 큐 커서를 쓰지 않는다:
  // onReload로 pending이 줄면 cur=pending[0]이 자연히 다음 건이 된다(idx 이중 전진 버그 방지).
  const confirmLog = useCallback(async (log_id) => {
    setBusy(true); setErr("");
    try {
      const { data: sess } = await memberSupabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setErr("세션이 만료됐어요. 다시 로그인해 주세요."); return; }
      const res = await fetch("/api/member-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ log_id, result: "confirm" }),
      });
      if (res.status === 503) { setServerOff(true); setModalOpen(false); return; } // fail-open: 유도 끔
      if (res.status === 409) { await onReload?.(); return; } // 이미 확인됨 → 재조회로 정리, 성공 취급
      if (!res.ok) { console.error("운동일지 확인 실패", res.status, await res.text().catch(() => "")); setErr("확인하지 못했어요. 다시 시도해 주세요."); return; }
      await onReload?.(); // 뷰 재조회 → confirmed_at 채워져 pending에서 빠짐
    } catch {
      setErr("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }, [onReload]);

  const snooze = () => setModalOpen(false);   // 이번만 닫기 — 다음에 페이지를 열면 다시 뜬다

  if (serverOff || pending.length === 0) return null;

  // 배너 = 항상. 앱 사용은 안 막는다(소프트).
  const banner = (
    <button
      onClick={() => setModalOpen(true)}
      className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-line bg-primary-soft px-4 py-3 text-left transition active:scale-[0.99]"
    >
      <CalendarCheck className="h-5 w-5 shrink-0 text-primary-strong" />
      <span className="flex-1 text-sm font-semibold text-primary-strong">
        확인 안 한 운동일지 {pending.length}건
      </span>
      <span className="shrink-0 text-[11px] font-bold text-primary-strong">확인하기 ›</span>
    </button>
  );

  const cur = pending[0]; // 항상 맨 앞 1건만. onReload로 처리분이 빠지면 다음 건이 자동으로 앞으로 온다.

  return (
    <>
      {banner}
      {modalOpen && cur && (
        <Modal variant="sheet" blocking onClose={() => setModalOpen(false)} title="운동일지 확인" subtitle={`남은 ${pending.length}건`}>
          <Card padding="md" className="bg-elevate">
            <div className="text-xs font-semibold text-muted">
              {cur.session_at ? new Date(cur.session_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "날짜 미상"}
            </div>
            {cur.ai_summary && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{cur.ai_summary}</p>
            )}
            {setLines(cur).length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-line pt-2">
                {setLines(cur).map((x, k) => (
                  <li key={k} className="text-[14px] leading-relaxed">
                    <span className="font-semibold text-ink">{x.name}</span>
                    {x.body && <span className="ml-2 font-mono text-[13px] text-sub">{x.body}</span>}
                  </li>
                ))}
              </ul>
            )}
            {!cur.ai_summary && setLines(cur).length === 0 && <p className="mt-2 text-sm text-muted">수업 기록만 있고 내용은 비어 있어요.</p>}
          </Card>
          <p className="mt-3 text-[13px] leading-relaxed text-sub">이 날 수업을 받은 게 맞으면 확인해 주세요. 다르면 &lsquo;나중에 할게요&rsquo;를 누르고 트레이너에게 말해 주세요.</p>

          {err && <p className="mt-3 text-[12px] text-danger-text">{err}</p>}

          <div className="mt-4 space-y-2">
            <Button variant="primary" size="md" fullWidth disabled={busy}
              onClick={() => confirmLog(cur.id)}>
              확인했어요
            </Button>
            <button type="button" onClick={snooze} disabled={busy} className="min-h-[44px] w-full text-center text-[14px] font-semibold text-sub">
              나중에 할게요
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function HomeView({ me, logs, inbody, cardio, onReloadCardio, photos, onReloadPhotos, schedule, onReloadSchedule, onSignOut, ounwan, rewards, onReloadLogs, consentRows, onConsentRows }) {
  // 탭(2026-10-06 대표: '내 기록'에 정보가 너무 많다) — 홈 · 운동일지 · 변화 · 기록하기. 첫 화면 = 홈.
  //   전부 그려 두고 안 보이는 탭만 숨긴다 — 탭을 오가도 펼친 것 · 쓰던 글 · 확인 창 상태가 남는다.
  const [subTab, setSubTab] = useState("home");
  const [nowMs] = useState(() => Date.now());
  // 동의(2026-10-05) — consentRows가 null이면 표 없음 · 조회 실패 → 묻지 않는다(잠금 금지).
  const consent = useMemo(() => (consentRows ? latestConsent(consentRows) : null), [consentRows]);
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

  // 필수 동의(이번 문구 버전) 전엔 기록을 안 보여 준다.
  if (consent && !(consent.general?.agreed && consent.general.version === CONSENT_VERSION)) {
    return <ConsentGate supabase={memberSupabase} me={me} onSignOut={onSignOut} onDone={(rows) => onConsentRows?.(rows)} />;
  }
  // 동의 기록을 못 읽었으면(조회 실패) 건강정보는 '동의 안 함'으로 본다 — 모르면 민감정보를 받지 않는다(2026-10-06).
  const healthOk = consent ? Boolean(consent.health?.agreed) : false;

  // 지난 회원(PT 종료) = 볼 수만 있음 · 6개월(DB가 쓰기를 막고, 6개월 뒤엔 아무것도 안 읽힌다 · 2026-10-05).
  const ended = me.status === "inactive";
  // 남은 수업 0회 = 입력 잠금(대표 결정 2026-10-05 · DB auth_member_writable과 같은 조건). 운동일지 '확인'은 그대로 된다.
  const noSessions = !ended && me.writable === false;
  const readOnly = ended || noSessions;
  const viewUntil = ended && me.status_changed_at ? (() => { const d = new Date(me.status_changed_at); d.setMonth(d.getMonth() + 6); return d; })() : null;
  const tab = readOnly && subTab === "write" ? "home" : subTab;
  const goTab = (t) => { setSubTab(t); try { window.scrollTo({ top: 0 }); } catch { /* 무시 */ } };
  // 운동일지 탭 숫자 = 확인 알림과 같은 기준(수업 1시간 뒤 · confirmDue).
  const pendingCount = ended ? 0 : logs.filter((l) => !l.confirmed_at && confirmDue(l, nowMs)).length;
  const TABS = [["home", "홈"], ["logs", "운동일지"], ["change", "변화"], ...(readOnly ? [] : [["write", "기록하기"]])];

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
            <Wordmark className="text-[13px] font-extrabold tracking-[-0.05em]" />
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

        {readOnly && (
          <div className="mb-6 rounded-2xl border border-line bg-card px-4 py-3.5 shadow-sm">
            <p className="text-[15px] font-bold text-ink">{noSessions ? "남은 수업이 없어서 기록을 남길 수 없어요" : "PT가 끝나서 기록을 볼 수만 있어요"}</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-sub">
              {noSessions
                ? "재등록하면 개인운동 · 유산소 · 사진 기록이 다시 열려요. 지금까지 기록은 그대로 볼 수 있어요."
                : `${viewUntil ? `${viewUntil.getFullYear()}년 ${viewUntil.getMonth() + 1}월 ${viewUntil.getDate()}일까지 볼 수 있어요. ` : ""}다시 시작하려면 트레이너에게 말해 주세요. 기록은 그대로 이어져요.`}
            </p>
          </div>
        )}

        {/* 탭 — 위에 붙어 있어 스크롤해도 바로 바꿀 수 있다. */}
        <nav className="sticky top-0 z-20 -mx-4 mb-5 bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6" aria-label="회원 페이지">
          <div className="flex gap-1 rounded-full bg-elevate p-[3px]" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => goTab(k)}
                className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-full px-1 text-[14px] transition ${tab === k ? "bg-card font-semibold text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
                {label}
                {k === "logs" && pendingCount > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-bold leading-none text-white" aria-label={`확인 안 한 운동일지 ${pendingCount}건`}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* 운동일지 확인 유도 — 배너 + pending≥3 소프트 모달. 홈 · 운동일지 탭에서 보이고, 한 번만 그려 두어 탭을 바꿔도 창이 다시 안 뜬다. */}
        {!ended && (
          <div hidden={tab !== "home" && tab !== "logs"}>
            <ConfirmFlow logs={logs} onReload={onReloadLogs} />
          </div>
        )}

        {/* ── 홈: 내 PT · 오운완 · 달력 ── */}
        <div hidden={tab !== "home"}>

        {/* 내 PT — 남은 수업 · 다음 수업 · 목표 로드맵(2026-10-03 · 자기완결 · 표 없으면 숨김) */}
        <MyPtCard supabase={memberSupabase} />

        {/* 오운완 카드 — 최상단. 누적·연속은 RPC(ounwan) 값만 사용(§2 규칙).
            '오늘 했는지'만 로컬 파생 — 오늘은 항상 최근 조회 창 안이라 정확하다. */}
        <OunwanCard
          stats={ounwan}
          rewards={rewards}
          todayDone={Boolean(buildActivityMap(logs, cardio, schedule)[todayStr()])}
          onGoWrite={readOnly ? null : () => goTab("write")}
        />

        {/* 운동 달력 — 이미 로드된 logs·cardio·schedule 파생(추가 쿼리 없음). 한눈 개요 먼저. */}
        <MemberActivityCalendar logs={logs} cardio={cardio} schedule={schedule} />
        </div>

        {/* ── 운동일지: PT 운동일지 · 내가 한 개인운동 · 유산소 ── */}
        <div hidden={tab !== "logs"}>

        {/* 수업일지 타임라인 */}
        <section className="mb-8">
          <Eyebrow icon={NotebookPen}>내 운동일지</Eyebrow>
          {logs.length === 0 ? (
            <EmptyState className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm">
              아직 기록된 운동일지가 없어요.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {logs.map((l, i) => {
                const round = logs.length - i; // 최신순 배열 → 오래된 게 1회차(누적)
                const lines = setLines(l);
                const hasMore = Boolean(l.ai_summary) || lines.length > 0;
                return (
                  <li key={l.id}>
                    <details className="group rounded-2xl border border-line bg-card p-4 shadow-sm">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-primary-strong">{fmtDay(l.session_at ?? l.created_at)}</span>
                          <span className="rounded-full bg-elevate px-2 py-0.5 text-[11px] font-semibold text-sub">{round}회차</span>
                          {/* 확인 상태 뱃지 — 뷰의 confirmed_at 파생. 확정=숨김(깔끔), 미확인=neutral(이의 제거). */}
                          {!l.confirmed_at ? (
                            <Badge tone="neutral">미확인</Badge>
                          ) : null}
                          {hasMore && (
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                          )}
                        </div>
                        {l.ai_summary ? (
                          <p className="mt-1.5 text-sm text-sub line-clamp-1 group-open:hidden">{l.ai_summary}</p>
                        ) : lines.length ? (
                          <p className="mt-1.5 text-sm text-sub line-clamp-1 group-open:hidden">{lines.map((x) => x.name).join(" · ")}</p>
                        ) : (
                          <p className="mt-1.5 text-sm text-muted">상세 내용이 없어요.</p>
                        )}
                      </summary>
                      {l.ai_summary && (
                        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{l.ai_summary}</p>
                      )}
                      {lines.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                          {lines.map((x, k) => (
                            <li key={k} className="text-[14px] leading-relaxed">
                              <span className="font-semibold text-ink">{x.name}</span>
                              {x.body && <span className="ml-2 font-mono text-[13px] text-sub">{x.body}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <ScheduleSection me={me} schedule={schedule} onReload={onReloadSchedule} mode="list" readOnly={readOnly} />
        <CardioSection me={me} cardio={cardio} onReload={onReloadCardio} mode="list" readOnly={readOnly} />
        </div>

        {/* ── 변화: 인바디 · 종목별 무게 · 사진 ── */}
        <div hidden={tab !== "change"}>
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
                      <div className="text-[11px] tracking-label-ko text-muted">{f.label}</div>
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

        <PhotoSection me={me} photos={photos} onReload={onReloadPhotos} mode="list" readOnly={readOnly} />
        </div>

        {/* ── 기록하기(지난 회원 · 남은 수업 0회는 없음) ── */}
        {!readOnly && (
          <div hidden={tab !== "write"}>
        {/* 오늘 할 개인운동(트레이너가 확정 · 보이기 켠 루틴 · 2026-10-04) — 맨 위 */}
        <RoutineSection supabase={memberSupabase} me={me} ptLogs={logs} healthOk={healthOk} onSaved={() => { onReloadSchedule?.(); onReloadLogs?.(); }} />

        {/* 개인운동 기록(M3) — 폼만(목록은 내 기록 탭). */}
        <ScheduleSection me={me} schedule={schedule} onReload={onReloadSchedule} mode="form" />

        {/* 유산소 기록(M1) — 폼만. */}
        <CardioSection me={me} cardio={cardio} onReload={onReloadCardio} mode="form" />

        {/* 비포애프터 사진(M2) — 폼만. */}
        <PhotoSection me={me} photos={photos} onReload={onReloadPhotos} mode="form" />
          </div>
        )}

        <MemberFooter supabase={memberSupabase} me={me} consent={consent} onChanged={(rows) => onConsentRows?.(rows)} />

        {/* 로그아웃 */}
        <div className="mt-4 text-center">
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
  const [ounwan, setOunwan] = useState(null);   // ounwan_stats() 1행 {total, month_count, streak} — 누적·연속의 유일한 소스
  const [rewards, setRewards] = useState([]);   // 내 트레이너의 활성 포상(회원 read 정책 스코프)
  const [consentRows, setConsentRows] = useState(null); // member_consent 본인 행 · null = 표 없음/조회 실패(동의 화면 건너뜀)
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
      const [meRes, logRes, inbodyRes, cardioRes, photoRes, schedRes, ounwanRes, rewardRes, consentRes] = await Promise.all([
        memberSupabase.from("member_me").select("*").maybeSingle(),
        // 수업 날짜(session_at) 기준 최신순 — 늦게 적은 일지가 맨 위로 오지 않게. 옛 행(session_at 없음)은 뒤로.
        memberSupabase.from("member_workout_log").select("*")
          .order("session_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        memberSupabase.from("member_inbody").select("*").order("measured_at", { ascending: true }),
        memberSupabase.from("cardio_log").select("*").order("performed_on", { ascending: false }).limit(30),
        memberSupabase.from("member_photo").select("*").order("taken_on", { ascending: false }).limit(60),
        memberSupabase.from("schedule_check").select("*").order("on_date", { ascending: false }).limit(60),
        // 오운완 집계 — 서버 RPC(정의 단일 출처). 위 조회들의 limit과 무관하게 전체 이력 기준.
        memberSupabase.rpc("ounwan_stats"),
        memberSupabase.from("trainer_reward").select("*").eq("active", true).order("milestone"),
        memberSupabase.from("member_consent").select("kind, agreed, created_at, version"),
      ]);
      // 공용 기기: 다른 회원 링크를 열었는데 앞 회원 세션이 남아 있으면 로그아웃하고 이 링크로 다시 로그인(2026-10-06).
      if (meRes.data?.member_token && token && meRes.data.member_token.toLowerCase() !== String(token).toLowerCase()) {
        await memberSupabase.auth.signOut({ scope: "local" });
        setPhase("login");
        return;
      }
      setMe(meRes.data ?? null);
      setLogs(logRes.data ?? []);
      setInbody(inbodyRes.data ?? []);
      setCardio(cardioRes.data ?? []);
      setPhotos(photoRes.data ?? []);
      setSchedule(schedRes.data ?? []);
      setOunwan(ounwanRes.data?.[0] ?? null);   // RPC는 setof → 배열. 실패/0행이면 null(카드가 0으로 표시)
      setRewards(rewardRes.data ?? []);
      if (consentRes.error) console.error("동의 기록 조회 실패", consentRes.error);
      setConsentRows(consentRes.error ? null : consentRes.data ?? []);
      setPhase("home");
    } catch {
      setPhase("home"); // 부분 실패해도 빈 상태로 진입(me null → 재로그인 안내 카드) — 무한 스피너 방지
    }
  }, [token]);

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
    if (!memberSupabase) { setErr("데모 모드라 로그인할 수 없어요."); return; }
    if (!/^\d{4}$/.test(last4)) { setErr("휴대폰 뒤 4자리를 입력해 주세요."); return; }
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
      setErr("네트워크 오류예요. 잠시 후 다시 시도해 주세요.");
    }
    setBusy(false);
  };

  const signOut = async () => {
    if (memberSupabase) await memberSupabase.auth.signOut({ scope: "local" }); // 이 기기만(다른 기기 로그인은 그대로)
    setMe(null); setLogs([]); setInbody([]); setCardio([]); setPhotos([]); setSchedule([]); setOunwan(null); setRewards([]); setConsentRows(null); setLast4(""); setPhase("login");
  };

  if (phase === "checking") return <ScreenMsg>불러오는 중…</ScreenMsg>;
  if (phase === "login")
    return <LoginCard last4={last4} setLast4={setLast4} onSubmit={submit} busy={busy} err={err} />;
  return <HomeView me={me} logs={logs} inbody={inbody} cardio={cardio} onReloadCardio={loadCardio} photos={photos} onReloadPhotos={loadPhotos} schedule={schedule} onReloadSchedule={loadSchedule} onSignOut={signOut} ounwan={ounwan} rewards={rewards} onReloadLogs={loadHome} consentRows={consentRows} onConsentRows={(rows) => setConsentRows((p) => [...(p || []), ...rows])} />;
}

"use client";
/* 트레이너 — 회원 비포애프터 사진(member_photo). 열람 + 트레이너 업로드(상호 · 5번).
   업로드: compressImage → 회원 폴더 {member.id}/ 업로드 → member_photo insert(uploaded_by='trainer').
   삭제: 트레이너는 자기 업로드분(uploaded_by='trainer')만 — storage 먼저→row(정책 조인 유지).
   회원 업로드분은 회원이 관리(트레이너 삭제 버튼 안 뜸). 데모(키 없음)면 숨김. */
import { useCallback, useEffect, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/image";
import Eyebrow from "@/components/ui/Eyebrow";
import ImageLightbox from "@/components/ui/ImageLightbox";

const PHOTO_LABELS = { before: "비포", progress: "진행", after: "애프터" };

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? String(iso) : d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

// 오늘 YYYY-MM-DD (트레이너 브라우저 로컬)
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function MemberPhotoSummary({ member, mode }) {
  const [rows, setRows] = useState([]);
  const [urls, setUrls] = useState({}); // storage_path -> signed url (1h)
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  // 트레이너 업로드 폼
  const [label, setLabel] = useState("progress");
  const [takenOn, setTakenOn] = useState(() => todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const memberId = member?.id; // 원시값으로 고정(useCallback 메모 보존 규칙)

  // 조회 + 서명 URL. 업로드/삭제 후 재호출.
  const loadRows = useCallback(async () => {
    if (!supabase || !memberId) { setRows([]); setUrls({}); return; }
    setLoading(true);
    const { data } = await supabase
      .from("member_photo")
      .select("*")
      .eq("user_id", memberId)
      .order("taken_on", { ascending: false })
      .limit(24);
    const list = data || [];
    setRows(list);
    if (list.length) {
      const { data: signed } = await supabase.storage
        .from("member-photos")
        .createSignedUrls(list.map((p) => p.storage_path), 3600);
      const map = {};
      (signed || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
    } else {
      setUrls({});
    }
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await loadRows(); })();
    return () => { cancelled = true; };
  }, [loadRows]);

  // 업로드 — 압축→회원 폴더 업로드→insert(uploaded_by='trainer'). 실패 시 파일 롤백.
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file || busy) return;
    if (!supabase || !member?.id) { setErr("정보를 불러오는 중이에요. 잠시 후 다시."); return; }
    setBusy(true); setErr("");
    let blob;
    try { blob = await compressImage(file); }
    catch { setBusy(false); setErr("이 사진을 읽지 못했어요. 다른 사진으로 시도하세요."); return; }
    const path = `${member.id}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("member-photos")
      .upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) { setBusy(false); setErr("업로드에 실패했어요: " + upErr.message); return; }
    const { data, error } = await supabase
      .from("member_photo")
      .insert({ user_id: member.id, storage_path: path, label, taken_on: takenOn, uploaded_by: "trainer" })
      .select();
    if (error || !data || data.length === 0) {
      await supabase.storage.from("member-photos").remove([path]); // 고아 방지
      setBusy(false);
      setErr("기록 저장에 실패했어요" + (error ? ": " + error.message : " (0행 — 권한/정책)"));
      return;
    }
    await loadRows();
    setBusy(false);
  };

  // 삭제(트레이너 업로드분만) — storage 먼저→row(정책이 row 조인으로 판정).
  const remove = async (photo) => {
    if (busy) return;
    setBusy(true); setErr("");
    const { error: sErr } = await supabase.storage.from("member-photos").remove([photo.storage_path]);
    if (sErr) { setBusy(false); setErr("삭제에 실패했어요: " + sErr.message); return; }
    const { data, error } = await supabase.from("member_photo").delete().eq("id", photo.id).select();
    if (error || !data || data.length === 0) {
      setBusy(false);
      setErr("삭제에 실패했어요" + (error ? ": " + error.message : " (0행 — 권한)"));
      return;
    }
    await loadRows();
    setBusy(false);
  };

  if (!supabase) return null; // 데모: 회원 입력이라 트레이너 데모 데이터 없음

  const inputCls =
    "mt-1 w-full min-w-0 rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink outline-none focus:border-primary disabled:opacity-50";

  return (
    <>
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <Eyebrow icon={Camera}>비포애프터 사진</Eyebrow>

      {/* 트레이너 업로드 폼 */}
      {mode !== "list" && (
      <div className="mt-2 rounded-xl border border-line bg-elevate p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-medium text-muted">
            분류
            <select value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} className={inputCls}>
              <option value="before">비포</option>
              <option value="progress">진행</option>
              <option value="after">애프터</option>
            </select>
          </label>
          <label className="text-[11px] font-medium text-muted">
            날짜
            <input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} disabled={busy} className={inputCls} />
          </label>
        </div>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <label className={`mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary-soft px-3 py-2 text-xs font-bold text-primary-strong ${busy ? "opacity-60" : ""}`}>
          <ImagePlus className="h-4 w-4" /> {busy ? "올리는 중…" : "사진 올리기"}
          <input type="file" accept="image/*" onChange={onPick} disabled={busy} className="hidden" />
        </label>
      </div>
      )}

      {/* 갤러리 */}
      {mode !== "form" && (loading ? (
        <p className="mt-2 text-sm text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">아직 사진이 없어요.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rows.map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded-xl border border-line bg-elevate">
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
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">…</div>
                )}
              </div>
              <div className="absolute left-1 top-1 flex items-center gap-1">
                {p.label && (
                  <span className="rounded bg-card/85 px-1.5 py-0.5 text-[10px] font-semibold text-sub">
                    {PHOTO_LABELS[p.label] || p.label}
                  </span>
                )}
              </div>
              <div className="absolute bottom-1 left-1 rounded bg-card/85 px-1.5 py-0.5 text-[10px] text-sub">
                {fmtDay(p.taken_on)}
              </div>
              {p.uploaded_by === "trainer" && (
                <button
                  onClick={() => remove(p)}
                  disabled={busy}
                  className="absolute right-1 top-1 rounded-lg bg-card/85 p-1 text-muted transition hover:text-rose-600 disabled:opacity-50"
                  aria-label="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
    <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

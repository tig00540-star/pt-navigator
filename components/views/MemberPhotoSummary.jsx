"use client";
/* 트레이너 읽기 전용 — 회원 자가입력 비포애프터 사진(member_photo) 썸네일. 최근 24장.
   쓰기 없음(회원 소유). 트레이너 select 정책(account 조인)·storage 서명 URL로만 열람.
   기록 0장·데모(키 없음)면 섹션 자체 숨김. */
import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import ImageLightbox from "@/components/ui/ImageLightbox";

const PHOTO_LABELS = { before: "비포", progress: "진행", after: "애프터" };

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? String(iso) : d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export default function MemberPhotoSummary({ member }) {
  const [rows, setRows] = useState([]);
  const [urls, setUrls] = useState({}); // storage_path -> signed url (1h)
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  // 회원 변경 시 조회 + 서명 URL 생성. setState는 async IIFE 안에서만(set-state-in-effect 회피).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        if (!cancelled) { setRows([]); setUrls({}); setLoading(false); }
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("member_photo")
        .select("*")
        .eq("user_id", member.id)
        .order("taken_on", { ascending: false })
        .limit(24);
      if (cancelled) return;
      const list = data || [];
      setRows(list);
      if (list.length) {
        const { data: signed } = await supabase.storage
          .from("member-photos")
          .createSignedUrls(list.map((p) => p.storage_path), 3600);
        if (cancelled) return;
        const map = {};
        (signed || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
        setUrls(map);
      } else {
        setUrls({});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  if (!supabase) return null;                 // 데모: 사진은 회원 입력이라 트레이너 데모 데이터 없음
  if (!loading && rows.length === 0) return null; // 0장이면 섹션 숨김

  return (
    <>
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <Eyebrow icon={Camera}>비포애프터 사진</Eyebrow>
      {loading ? (
        <p className="mt-2 text-sm text-muted">불러오는 중…</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
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
            </div>
          ))}
        </div>
      )}
    </section>
    <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

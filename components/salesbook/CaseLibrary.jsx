"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 URL·로컬 미리보기 이미지라 next/image 최적화 대상이 아니다(기존 사진 화면과 같음). */

/* =========================================================================
   CaseLibrary — 사례 보관함(세일즈북 1단계 · 2026-10-02 대표 요청).
   다른 회원의 변화(비포·애프터 · 인바디 · 운동 무게)와 회원 후기 캡처를 모아 두는 곳.
   2단계 세일즈북에서 '이런 변화를 만들어요' 장으로 골라 넣는다.

   원칙
   - 숫자는 기록에서만(lib/salesCase가 스냅샷) — 손으로 고칠 수 없다.
   - 저장되는 라벨은 익명("30대 여성 · 12주"). 고르는 화면에서만 트레이너가 이름을 본다.
   - 회원 동의·개인정보는 트레이너 책임(대표 결정). 화면엔 한 줄 안내만 둔다.
   - 사진 사례는 member_photo 경로를 참조만 — 회원이 사진을 지우면 사례에서도 빠진다.
   DB: sales_case(docs/migrations/2026-10-02-sales-case.sql) · 후기 이미지 = 비공개 버킷 sales-cases/{account_id}/…
   ========================================================================= */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookImage, Check, Dumbbell, ImagePlus, MessageSquareQuote, Plus, Scale } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PHOTO_URL_TTL } from "@/lib/photoUrl";
import { compressImage } from "@/lib/image";
import { useMembers } from "@/components/app/MembersProvider";
import { useToast } from "@/hooks/useToast";
import Toast from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import FilterChip from "@/components/ui/FilterChip";
import ImageLightbox from "@/components/ui/ImageLightbox";
import { Input } from "@/components/ui/Field";
import CaseCard from "@/components/salesbook/CaseCard";
import { signCaseUrls, loadMyCases } from "@/components/salesbook/caseData";
import { PORTFOLIO_VERSION } from "@/lib/consent";
import { fetchByIds } from "@/lib/fetchByIds";
import {
  CASE_KINDS, CASE_CATEGORIES, guessCategory, anonLabel, deltaText, improved, inbodyCandidates, liftCandidates, photoCaseData, shortDay, weeksBetween,
} from "@/lib/salesCase";

const ADD_BUTTONS = [
  { kind: "photo", label: "비포·애프터", icon: BookImage },
  { kind: "inbody", label: "인바디 변화", icon: Scale },
  { kind: "lift", label: "운동 변화", icon: Dumbbell },
  { kind: "review", label: "회원 후기", icon: MessageSquareQuote },
];

export default function CaseLibrary() {
  const { members, myUid } = useMembers();
  const { toast, showToast } = useToast();
  const [cases, setCases] = useState([]);
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [cat, setCat] = useState("all"); // 목적 필터
  const [adding, setAdding] = useState(null); // kind
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [pcons, setPcons] = useState([]); // 포트폴리오 활용 동의 행(2026-10-08) — 사례마다 '다른 아이디로 가져갈 수 있나' 표시

  // 고를 회원 — 내 회원(없으면 센터 전체 · 대표 계정 폴백). 보관(hidden)은 이미 빠져 있다.
  const scoped = useMemo(() => {
    const mine = members.filter((m) => m.trainer_id === myUid);
    return mine.length ? mine : members;
  }, [members, myUid]);

  const load = useCallback(async () => {
    if (!supabase || !myUid) { setLoading(false); return; }
    setLoading(true);
    setLoadErr("");
    try {
      const { data, error } = await loadMyCases(myUid);
      if (error) { console.error("sales_case 불러오기 실패", error); setLoadErr("사례를 불러오지 못했어요. 다시 시도해 주세요."); return; }
      setCases(data || []);
      setUrls(await signCaseUrls(data || []));
      const ids = [...new Set((data || []).map((c) => c.member_id).filter(Boolean))];
      if (ids.length) {
        const { data: cr, error: ce } = await fetchByIds(supabase, "member_consent", "member_id, trainer_id, agreed, created_at", "member_id", ids, (q) => q.eq("kind", "portfolio"));
        if (ce) console.error("포트폴리오 동의 읽기 실패", ce);
        setPcons(cr || []);
      }
    } catch (e) {
      console.error("sales_case 불러오기 실패", e);
      setLoadErr("사례를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [myUid]);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  const insertCase = async (row) => {
    const { data, error } = await supabase.from("sales_case").insert(row).select("*");
    if (error || !data?.length) {
      console.error("sales_case 저장 실패", error);
      showToast(error ? "담지 못했어요. 다시 시도해 주세요." : "담지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요.");
      return null;
    }
    const added = data[0];
    setCases((cs) => [added, ...cs]);
    const signed = await signCaseUrls([added]);
    setUrls((u) => ({ ...u, ...signed }));
    showToast("보관함에 담았어요");
    return added;
  };

  // 목적 바꾸기 — data.category만 고친다(숫자 스냅샷은 그대로).
  const setCategory = async (item, category) => {
    const data = { ...(item.data || {}), category: category || null };
    const { data: up, error } = await supabase.from("sales_case").update({ data }).eq("id", item.id).select("id");
    if (error || !up?.length) { showToast("바꾸지 못했어요. 다시 시도해 주세요."); return; }
    setCases((cs) => cs.map((c) => (c.id === item.id ? { ...c, data } : c)));
  };

  const removeCase = async (item) => {
    if (busy) return;
    if (!window.confirm("이 사례를 보관함에서 뺄까요?")) return;
    setBusy(true);
    try {
      // 내 계정 폴더의 파일만 지운다(후기 캡처 · 다른 아이디에서 가져온 사진 사례). 회원 사진(member-photos)은 회원 것이라 안 지움.
      const own = [item.kind === "review" && item.data?.path,
        ...["before", "after"].map((k) => item.data?.[k]?.bucket === "sales-cases" && item.data[k].path)].filter(Boolean);
      if (own.length) await supabase.storage.from("sales-cases").remove(own);
      const { data, error } = await supabase.from("sales_case").delete().eq("id", item.id).select("id");
      if (error || !data?.length) { showToast("빼지 못했어요. 다시 시도해 주세요."); return; }
      setCases((cs) => cs.filter((c) => c.id !== item.id));
      showToast("보관함에서 뺐어요");
    } catch {
      showToast("빼지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  // 포트폴리오 동의 — 내 아이디에 묶인 동의(또는 전체 철회) 중 가장 최근 행. 가져온 사례는 원래 회원 동의로 들어온 것.
  const portfolioOf = (c) => {
    if (c.data?.portfolio) return "copied";
    if (!c.member_id) return null;
    let last = null;
    for (const r of pcons) if (r.member_id === c.member_id && (r.trainer_id === myUid || r.trainer_id == null) && (!last || r.created_at > last.created_at)) last = r;
    return last?.agreed ? "agreed" : "none";
  };
  const paperConsent = async (c) => {
    if (busy || !supabase) return;
    if (!window.confirm("이 회원에게 '트레이너 포트폴리오 활용' 종이 동의서를 받으셨나요? 받은 경우에만 눌러 주세요.")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("member_consent")
        .insert({ member_id: c.member_id, kind: "portfolio", agreed: true, method: "trainer_check", version: PORTFOLIO_VERSION, trainer_id: myUid })
        .select("member_id, trainer_id, agreed, created_at");
      if (error || !data?.length) { console.error("포트폴리오 동의 저장 실패", error); showToast("저장하지 못했어요. 다시 시도해 주세요."); return; }
      setPcons((p) => [...p, ...data]);
      showToast("동의 받은 것으로 남겼어요");
    } finally { setBusy(false); }
  };

  const shown = cases
    .filter((c) => filter === "all" || c.kind === filter)
    .filter((c) => cat === "all" || (cat === "none" ? !c.data?.category : c.data?.category === cat));
  const catCount = (k) => cases.filter((c) => c.data?.category === k).length;
  const countOf = (k) => cases.filter((c) => c.kind === k).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.03em] text-ink">사례 보관함</h1>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-sub">
          내가 만든 회원 변화와 후기를 모아 두는 곳이에요. 세일즈북에 넣어 새 회원에게 <b className="font-semibold text-primary-strong">이런 변화를 만들어요</b>라고 보여줄 수 있어요.
        </p>
        <p className="m-0 mt-1 text-[12px] text-muted">화면엔 이름 대신 &lsquo;30대 여성 · 12주&rsquo;처럼 보여요. 회원 동의는 트레이너가 받아 주세요. 회원이 회원 페이지에서 &lsquo;트레이너 포트폴리오 활용&rsquo;에 동의한 사례는 나중에 아이디를 옮겨도 가져갈 수 있어요.</p>
      </div>

      {!supabase && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">데모 모드라 사례를 담을 수 없어요.</div>
      )}

      {/* 담기 버튼 4개 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ADD_BUTTONS.map(({ kind, label, icon: Icon }) => (
          <button key={kind} type="button" onClick={() => setAdding(kind)} disabled={!supabase}
            className="flex min-h-[64px] items-center gap-2.5 rounded-xl border border-line bg-card px-3.5 text-left shadow-sm transition hover:border-line-strong disabled:opacity-50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-strong"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">{label}</span>
              <span className="flex items-center gap-0.5 text-[12px] text-muted"><Plus className="h-3 w-3" aria-hidden="true" />담기</span>
            </span>
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip selected={filter === "all"} onClick={() => setFilter("all")}>전체 {cases.length}</FilterChip>
        {CASE_KINDS.map((k) => (
          <FilterChip key={k.value} selected={filter === k.value} onClick={() => setFilter(k.value)}>{k.label} {countOf(k.value)}</FilterChip>
        ))}
      </div>
      <div className="-mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[12px] font-semibold text-muted">목적</span>
        <FilterChip selected={cat === "all"} onClick={() => setCat("all")}>전체</FilterChip>
        {CASE_CATEGORIES.map((k) => (
          <FilterChip key={k} selected={cat === k} onClick={() => setCat(k)}>{k} {catCount(k)}</FilterChip>
        ))}
        {cases.some((c) => !c.data?.category) && <FilterChip selected={cat === "none"} onClick={() => setCat("none")}>미분류</FilterChip>}
      </div>

      {loading ? (
        <p className="text-[13px] text-muted">불러오는 중…</p>
      ) : loadErr ? (
        <p className="text-[13px] text-danger-text">{loadErr}</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-8 text-center">
          <p className="m-0 text-[15px] font-semibold text-ink">아직 담은 사례가 없어요</p>
          <p className="m-0 mt-1 text-[13px] text-sub">위 버튼으로 회원 변화나 후기를 담아 보세요. 인바디·운동 변화는 앱이 기록에서 변화가 큰 회원을 먼저 찾아 드려요.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-col gap-1.5">
              <CaseCard item={c} urls={urls} onOpenImage={setLightbox} onDelete={removeCase} onCategory={setCategory} busy={busy} />
              {portfolioOf(c) === "agreed" && <p className="m-0 px-1 text-[12px] text-sub">포트폴리오 동의 있음 · 아이디를 옮겨도 가져갈 수 있어요</p>}
              {portfolioOf(c) === "copied" && <p className="m-0 px-1 text-[12px] text-sub">다른 아이디에서 가져온 사례예요(회원 동의)</p>}
              {portfolioOf(c) === "none" && (
                <p className="m-0 px-1 text-[12px] text-muted">
                  포트폴리오 동의 없음 · 아이디를 옮기면 못 가져가요.{" "}
                  <button type="button" onClick={() => paperConsent(c)} disabled={busy} className="font-semibold text-sub underline underline-offset-2 disabled:opacity-50">종이로 받았어요</button>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {adding === "photo" && <PhotoPicker members={scoped} onClose={() => setAdding(null)} onAdd={insertCase} />}
      {adding === "inbody" && <InbodyPicker members={scoped} cases={cases} onClose={() => setAdding(null)} onAdd={insertCase} />}
      {adding === "lift" && <LiftPicker members={scoped} cases={cases} onClose={() => setAdding(null)} onAdd={insertCase} />}
      {adding === "review" && <ReviewForm uid={myUid} onClose={() => setAdding(null)} onAdd={insertCase} showToast={showToast} />}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      <Toast message={toast} />
    </div>
  );
}

/* ── 비포·애프터: 회원 고르기 → 사진 2장 고르기 → 라벨 → 담기 ── */
function PhotoPicker({ members, onClose, onAdd }) {
  const [rows, setRows] = useState(null);
  const [memberId, setMemberId] = useState(null);
  const [urls, setUrls] = useState({});
  const [picked, setPicked] = useState([]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const ids = members.map((m) => m.id);
      if (!ids.length) { setRows([]); return; }
      const { data } = await fetchByIds(supabase, "member_photo", "id, user_id, storage_path, label, taken_on, uploaded_by", "user_id", ids);
      setRows((data || []).sort((a, b) => String(a.taken_on).localeCompare(String(b.taken_on))));
    })();
  }, [members]);

  const groups = useMemo(() => {
    const by = new Map();
    for (const r of rows || []) { if (!by.has(r.user_id)) by.set(r.user_id, []); by.get(r.user_id).push(r); }
    return members.map((m) => ({ member: m, photos: by.get(m.id) || [] })).filter((g) => g.photos.length >= 2);
  }, [rows, members]);
  const group = groups.find((g) => g.member.id === memberId) || null;

  const pickMember = async (g) => {
    setMemberId(g.member.id);
    setPicked([]);
    setLabel("");
    setCategory(guessCategory(g.member.goal));
    const { data } = await supabase.storage.from("member-photos").createSignedUrls(g.photos.map((p) => p.storage_path), PHOTO_URL_TTL);
    const map = {};
    (data || []).forEach((s) => { if (s.signedUrl) map[s.path] = s.signedUrl; });
    setUrls(map);
  };
  const toggle = (p) => {
    setPicked((cur) => {
      const next = cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p].slice(-2);
      if (next.length === 2 && group) setLabel(anonLabel(group.member, weeksBetween(next[0].taken_on, next[1].taken_on)));
      return next;
    });
  };
  const save = async () => {
    if (picked.length !== 2 || !group || saving) return;
    setSaving(true);
    const ok = await onAdd({ kind: "photo", member_id: group.member.id, label: label.trim() || anonLabel(group.member), note: note.trim() || null, data: { ...photoCaseData(picked[0], picked[1]), category } });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal variant="sheet" title="비포·애프터 담기" subtitle={group ? `${group.member.name} · 사진 2장을 골라 주세요` : "사진이 2장 이상 있는 회원이에요"} onClose={onClose}
      footer={group ? (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setMemberId(null)}>다른 회원</Button>
          <Button variant="primary" fullWidth onClick={save} disabled={picked.length !== 2 || saving}>{saving ? "담는 중…" : "보관함에 담기"}</Button>
        </div>
      ) : null}>
      {rows == null ? <p className="text-[13px] text-muted">불러오는 중…</p>
        : !group ? (
          groups.length === 0 ? <p className="text-[13px] text-sub">사진이 2장 이상인 회원이 아직 없어요. 회원 전용 페이지나 자료남기기에서 사진이 쌓이면 여기 떠요.</p> : (
            <ul className="m-0 list-none space-y-1.5 p-0">
              {groups.map((g) => (
                <li key={g.member.id}>
                  <button type="button" onClick={() => pickMember(g)} className="flex w-full items-center justify-between rounded-xl border border-line bg-card px-3.5 py-3 text-left transition hover:border-line-strong">
                    <span className="text-[14px] font-semibold text-ink">{g.member.name}</span>
                    <span className="text-[12px] text-muted">사진 {g.photos.length}장 · {shortDay(g.photos[0].taken_on)} ~ {shortDay(g.photos.at(-1).taken_on)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.photos.map((p) => {
                const idx = picked.findIndex((x) => x.id === p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p)} aria-pressed={idx >= 0}
                    className={`relative overflow-hidden rounded-lg border-2 ${idx >= 0 ? "border-primary" : "border-transparent"}`}>
                    <div className="aspect-[3/4] bg-elevate">{urls[p.storage_path] && <img src={urls[p.storage_path]} alt={`${shortDay(p.taken_on)} 사진`} className="h-full w-full object-cover" />}</div>
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1.5 py-0.5 text-[11px] text-white">{shortDay(p.taken_on)}{p.uploaded_by === "member" ? " · 회원" : ""}</span>
                    {idx >= 0 && <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
                  </button>
                );
              })}
            </div>
            {picked.length === 2 && (
              <>
                <CategoryChips value={category} onChange={setCategory} />
                <Input label="화면에 보일 이름" hint="실명 대신 익명으로 보여요" value={label} onChange={(e) => setLabel(e.target.value)} />
                <Input label="한 줄 메모" hint="선택" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예) 주 2회, 식단 같이 관리" />
              </>
            )}
          </div>
        )}
    </Modal>
  );
}

/* ── 인바디 변화: 앱이 찾은 후보(좋아진 폭 큰 순) → 담기 ── */
function InbodyPicker({ members, cases, onClose, onAdd }) {
  const [rows, setRows] = useState(null);
  const [savingId, setSavingId] = useState(null);
  useEffect(() => {
    (async () => {
      const ids = members.map((m) => m.id);
      if (!ids.length) { setRows([]); return; }
      const { data } = await fetchByIds(supabase, "inbody_log", "id, user_id, measured_at, weight, skeletal_muscle, body_fat_pct, body_fat_mass", "user_id", ids);
      setRows(data || []);
    })();
  }, [members]);
  const cands = useMemo(() => (rows ? inbodyCandidates(members, rows).slice(0, 30) : []), [rows, members]);
  const added = new Set(cases.filter((c) => c.kind === "inbody").map((c) => `${c.member_id}|${c.data?.to}`));

  const add = async (c) => {
    setSavingId(c.member.id);
    await onAdd({ kind: "inbody", member_id: c.member.id, label: anonLabel(c.member, c.data.weeks), data: { ...c.data, category: guessCategory(c.member.goal) } });
    setSavingId(null);
  };
  return (
    <Modal variant="sheet" title="인바디 변화 담기" subtitle="측정이 2번 이상인 회원 중 좋아진 폭이 큰 순이에요 · 목적은 회원 목표로 정해지고 카드에서 바꿀 수 있어요" onClose={onClose}>
      {rows == null ? <p className="text-[13px] text-muted">기록을 살펴보는 중…</p>
        : cands.length === 0 ? <p className="text-[13px] text-sub">아직 담을 만한 인바디 변화가 없어요. 같은 회원을 두 번 이상 측정하면 여기 떠요.</p>
        : (
          <ul className="m-0 list-none space-y-2 p-0">
            {cands.map((c) => {
              const done = added.has(`${c.member.id}|${c.data.to}`);
              return (
                <li key={c.member.id} className="rounded-xl border border-line bg-card px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{c.member.name} <span className="font-normal text-muted">· {c.data.weeks}주</span></span>
                    <Button size="sm" variant={done ? "ghost" : "primary"} disabled={done || savingId === c.member.id} onClick={() => add(c)}>{done ? "담음" : "담기"}</Button>
                  </div>
                  <p className="m-0 mt-1 text-[13px] text-sub">
                    {c.data.metrics.map((m) => (
                      <span key={m.key} className="mr-3 inline-block">{m.label} {m.first}→{m.latest}{m.unit} <b className={improved(m) ? "font-semibold text-primary-strong" : "font-normal text-muted"}>{deltaText(m.first, m.latest, m.unit)}</b></span>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
    </Modal>
  );
}

/* ── 운동 변화: 종목별 최고중량이 많이 는 순 → 담기 ── */
function LiftPicker({ members, cases, onClose, onAdd }) {
  const [rows, setRows] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  useEffect(() => {
    (async () => {
      const ids = members.map((m) => m.id);
      if (!ids.length) { setRows([]); return; }
      const { data } = await fetchByIds(supabase, "daily_workout_log", "id, user_id, session_at, created_at, sets_structured, voided, source", "user_id", ids, (q) => q.eq("voided", false));
      setRows(data || []);
    })();
  }, [members]);
  const cands = useMemo(() => (rows ? liftCandidates(members, rows).slice(0, 40) : []), [rows, members]);
  const added = new Set(cases.filter((c) => c.kind === "lift").map((c) => `${c.member_id}|${c.data?.exercise}`));

  const add = async (c) => {
    const key = `${c.member.id}|${c.data.exercise}`;
    setSavingKey(key);
    await onAdd({ kind: "lift", member_id: c.member.id, label: anonLabel(c.member, c.data.weeks), data: { ...c.data, category: guessCategory(c.member.goal) } });
    setSavingKey(null);
  };
  return (
    <Modal variant="sheet" title="운동 변화 담기" subtitle="운동일지 무게 기록에서 많이 는 순이에요 · 목적은 회원 목표로 정해지고 카드에서 바꿀 수 있어요" onClose={onClose}>
      {rows == null ? <p className="text-[13px] text-muted">기록을 살펴보는 중…</p>
        : cands.length === 0 ? <p className="text-[13px] text-sub">아직 담을 만한 운동 변화가 없어요. 운동일지에 무게가 두 번 이상 기록되면 여기 떠요.</p>
        : (
          <ul className="m-0 list-none space-y-2 p-0">
            {cands.map((c) => {
              const key = `${c.member.id}|${c.data.exercise}`;
              const done = added.has(key);
              return (
                <li key={key} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-3.5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">{c.member.name} · {c.data.exercise}</span>
                    <span className="block text-[13px] text-sub">{c.data.first}kg → {c.data.latest}kg <b className="font-semibold text-primary-strong">{deltaText(c.data.first, c.data.latest, "kg")}</b> · {c.data.weeks}주</span>
                  </span>
                  <Button size="sm" variant={done ? "ghost" : "primary"} disabled={done || savingKey === key} onClick={() => add(c)}>{done ? "담음" : "담기"}</Button>
                </li>
              );
            })}
          </ul>
        )}
    </Modal>
  );
}

/* ── 회원 후기: 캡처 올리기 + 라벨·메모 ── */
function ReviewForm({ uid, onClose, onAdd, showToast }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const save = async () => {
    if (!file || saving) return;
    setSaving(true);
    try {
      // 경로 첫 폴더 = account_id(버킷 정책). 트레이너 본인 행에서 읽는다.
      const { data: me } = await supabase.from("trainer").select("account_id").eq("id", uid).maybeSingle();
      if (!me?.account_id) { showToast("올리지 못했어요. 권한이 없거나 구독이 만료됐을 수 있어요."); return; }
      const blob = await compressImage(file, 1600, 0.85);
      const path = `${me.account_id}/${crypto.randomUUID()}.jpg`;
      const { error: ue } = await supabase.storage.from("sales-cases").upload(path, blob, { contentType: "image/jpeg" });
      if (ue) { console.error("후기 업로드 실패", ue); showToast("사진을 올리지 못했어요. 다시 시도해 주세요."); return; }
      const ok = await onAdd({ kind: "review", label: label.trim() || "회원 후기", note: note.trim() || null, data: { path, category } });
      if (ok) onClose();
      else await supabase.storage.from("sales-cases").remove([path]);
    } catch (e) {
      console.error("후기 저장 실패", e);
      showToast(e?.message === "이미지를 읽을 수 없어요" ? "이 사진은 읽을 수 없어요. 다른 사진으로 시도해 주세요." : "올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal variant="sheet" title="회원 후기 담기" subtitle="카톡·문자 캡처를 올려 주세요" onClose={onClose}
      footer={<Button variant="primary" fullWidth onClick={save} disabled={!file || saving}>{saving ? "올리는 중…" : "보관함에 담기"}</Button>}>
      <div className="space-y-3">
        <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-line-strong bg-elevate text-[13px] text-sub">
          {preview ? <img src={preview} alt="후기 미리보기" className="max-h-[360px] w-full object-contain" /> : (<><ImagePlus className="h-6 w-6" aria-hidden="true" /> 캡처 고르기</>)}
          <input type="file" accept="image/*" className="sr-only" onChange={onPick} />
        </label>
        <p className="m-0 text-[12px] text-muted">이름·프로필 사진이 보이면 잘라서 올려 주세요.</p>
        <CategoryChips value={category} onChange={setCategory} />
        <Input label="화면에 보일 이름" hint="선택" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예) 30대 직장인 회원" />
        <Input label="한 줄 메모" hint="선택" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예) 3개월 PT 끝나고 보내준 메시지" />
      </div>
    </Modal>
  );
}

/* 목적 고르기 — 세일즈북이 회원 목표와 같은 목적의 사례를 먼저 골라 준다. */
function CategoryChips({ value, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-sub">목적 <span className="font-normal text-muted">세일즈북에서 같은 목표 회원에게 먼저 보여 드려요</span></p>
      <div className="flex flex-wrap gap-1.5">
        {CASE_CATEGORIES.map((k) => (
          <FilterChip key={k} selected={value === k} onClick={() => onChange(value === k ? null : k)}>{k}</FilterChip>
        ))}
      </div>
    </div>
  );
}

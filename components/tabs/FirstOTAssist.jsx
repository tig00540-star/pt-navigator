"use client";

/* =========================================================================
   탭1 · ① AI 1차 OT 지원 블록 (Sonnet + 내 패키지 주입) — 사전무장 컨닝페이퍼.
   기본정보 + 내 패키지 + 즐겨찾기 자료 → /api/ot-brief {phase:"first"} → 3스텝:
   ① opening ② exercises(즉효 운동 3~4 · reason 중심 · lib_ref로 즐겨찾기 참조) ③ 클로징(sales_metaphor·closing_sequence·objection_defense).
   추천 가격은 AI가 준 pick_ref로 내 패키지 목록에서 조회해 렌더(AI는 번호만 = 환각 방지).
   ⚠️ 데모 폴백 없음. 캐시 = ot_log round-1 `report.first_assist`(관찰 데이터와 공존 · 병합 저장).
   round-1 행이 없으면(관찰 저장 전) 캐시 스킵 = 세션 전용. inputHash로 스테일 감지(회원 데이터 변경 시).
   구 스키마 캐시(arc·movement_cues 등, 신필드 전무)는 legacyCache로 감지 → '이전 형식' 안내 + '다시 생성'으로 갱신.
   ========================================================================= */

import { useEffect, useState } from "react";
import { Presentation } from "lucide-react";
import FirstProposalLauncher from "@/components/salesbook/FirstProposalLauncher";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import AIBriefBlock from "@/components/ui/AIBriefBlock";
import PrepReport from "@/components/ot/PrepReport";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { firstInputHash } from "@/lib/otHash";
import { markPending, clearPending, usePendingResult, isNewerThan } from "@/lib/aiPending";


export default function FirstOTAssist({ member, onSaved }) {
  const [proposal, setProposal] = useState(null); // null | "present" | "edit" — 1차 제안(짧은 세일즈북)
  const { toast, showToast } = useToast();
  const [data, setData] = useState(null); // ① brief JSON (캐시 또는 세션)
  const [meta, setMeta] = useState(null); // { generatedAt, model, inputHash }
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(""); // 실패/키미설정/세션전용 안내
  const [row1Id, setRow1Id] = useState(null); // round-1 행 id (없으면 캐시 스킵)
  const [row1Report, setRow1Report] = useState(null); // round-1 report(병합 대상 — 관찰 보존)
  const [packages, setPackages] = useState([]); // 본인 active 패키지(추천 재료 · pick_ref 조회)
  const [favorites, setFavorites] = useState([]); // 본인 즐겨찾기 운동자료(lib_ref 조회 · 상황별 우선 추천)

  // 회원 변경 시 round-1 캐시(report.first_assist) 로드. 데모/미설정 시 세션 전용.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNotice("");
      if (!supabase || !member?.id) {
        if (!cancelled) {
          setRow1Id(null);
          setRow1Report(null);
          setData(null);
          setMeta(null);
        }
        return;
      }
      const { data: rows } = await supabase
        .from("ot_log")
        .select("id, report")
        .eq("user_id", member.id)
        .eq("ot_round", 1)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = rows?.[0] || null;
      setRow1Id(row?.id || null);
      setRow1Report(row?.report || null);
      const fa = row?.report?.first_assist || null;
      if (fa?.data) {
        setData(fa.data); // 캐시 렌더 (재호출 X)
        setMeta(fa.meta || null);
      } else {
        setData(null);
        setMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  // 본인 active 패키지 로드(마운트 1회 · 회원 의존 아님). pick_ref로 실가격 조회하는 재료.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      const { data } = await supabase
        .from("pt_package").select("*")
        .eq("trainer_id", uid).eq("active", true) // 노출(active) 패키지만
        .order("sort", { ascending: true }).order("created_at", { ascending: true });
      if (!cancelled) setPackages(data || []);
      // 즐겨찾기 운동자료(favorite=true). ⚠️ favorite 컬럼 마이그레이션 전이면 에러→[] 폴백(비차단).
      const { data: favs } = await supabase
        .from("library_item").select("id, title, category, url, note")
        .eq("trainer_id", uid).eq("favorite", true)
        .order("category", { ascending: true }).order("created_at", { ascending: true });
      if (!cancelled) setFavorites(favs || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // 생성은 서버가 끝까지 돌리고 저장까지 한다(다른 화면·창 닫기에도 안 끊김 · 2026-10-02).
  //   화면은 '만드는 중'만 기억해 두고, 돌아오면 저장된 결과를 이어 받는다(lib/aiPending).
  const pendingKey = member?.id ? `first:${member.id}` : null;
  const generate = async () => {
    setLoading(true);
    setNotice("");
    if (pendingKey) markPending(pendingKey);
    try {
      const inputHash = firstInputHash(member);
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "first", member, packages, favorites, save: { kind: "ot", memberId: member.id, round: 1, meta: { inputHash } } }),
      });
      // 서버가 답을 준 순간에만 '만드는 중' 표시를 지운다 — 화면 이동·창 닫기로 끊긴 경우엔 남겨 두고 돌아왔을 때 이어 받는다.
      if (pendingKey) clearPending(pendingKey);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setNotice(d.error || "리포트를 만들지 못했어요. 다시 시도해 주세요.");
        return;
      }
      const result = await res.json();
      const newMeta = { generatedAt: new Date().toISOString(), model: res.headers.get("x-ai-model") || "", inputHash };
      setData(result);
      setMeta(newMeta);
      const savedRow = res.headers.get("x-saved-row");
      if (savedRow) {
        setRow1Id(savedRow);
        setRow1Report((r) => ({ ...(r || {}), first_assist: { data: result, meta: newMeta } }));
        onSaved?.();
      } else if (supabase) {
        setNotice("리포트를 저장하지 못했어요. 지금은 이 화면에서만 보여요. 권한이 없거나 구독이 만료됐을 수 있어요.");
      }
    } catch {
      setNotice("인터넷 연결을 확인하고 다시 시도해 주세요. (다른 화면에 다녀와도 만들던 리포트는 이어서 저장돼요)");
    } finally {
      setLoading(false);
    }
  };

  // 돌아왔을 때 이어 받기 — 다른 화면에 갔다 오는 사이 서버가 저장한 결과.
  const waiting = usePendingResult(pendingKey, async (since) => {
    const { data: rows } = await supabase.from("ot_log").select("id, report")
      .eq("user_id", member.id).eq("ot_round", 1).order("created_at", { ascending: false }).limit(1);
    const row = rows?.[0];
    return isNewerThan(row?.report?.first_assist?.meta?.generatedAt, since) ? row : null;
  }, (row) => {
    setRow1Id(row.id);
    setRow1Report(row.report);
    setData(row.report.first_assist.data);
    setMeta(row.report.first_assist.meta);
    onSaved?.();
  });

  // 캐시 스테일: 저장된 inputHash ≠ 현재 회원 입력 해시 → 재생성 권장.
  const persisted = Boolean(row1Report?.first_assist);
  const stale = Boolean(meta?.inputHash && meta.inputHash !== firstInputHash(member));
  // E: 입력(회원정보 해시)이 직전 생성과 동일 → 반복 호출 억제(버튼 흐리게 + 힌트). 하드락 아님(클릭은 됨) — 입력 바뀌면 stale로 자동 해제.
  const sameInput = Boolean(data && meta?.inputHash) && !stale;

  const exercises = Array.isArray(data?.exercises) ? data.exercises.filter(Boolean) : [];
  // 구캐시(구 스키마: session_plan·target_exercise) 감지 — exercises 없으면 '이전 형식' 안내 후 재생성.
  const legacyCache = Boolean(data) && exercises.length === 0 && Boolean(data?.target_exercise || Array.isArray(data?.session_plan));

  /* AIBriefBlock 상태 매핑 — 이 탭은 데모 폴백이 없다(실패 시 미표시).
     그래서 "demo"는 쓰지 않고 idle/loading/ready/stale 네 가지만 쓴다. */
  const briefStatus = loading || waiting ? "loading" : !data ? "idle" : stale ? "stale" : "ready";

  return (
    <>
    <AIBriefBlock
      status={briefStatus}
      title="오늘의 OT 사전 준비 리포트"
      generateLabel="OT 준비 리포트 만들기"
      idleDescription="1차 OT도 목표는 오늘 PT 등록이에요. 회원 정보와 내 PT 패키지·즐겨찾기 자료로 수업 직전 3분에 볼 리포트를 만들어요. 맨 위 30초 요약, 그다음 입장 · 운동 · 클로징 · 거절 대응 순서예요."
      waitingHint="1~2분 걸려요. 다른 화면에 다녀와도 괜찮아요. 만들던 리포트는 저장돼 있다가 돌아오면 바로 떠요."
      onGenerate={generate}
      onRegenerate={generate}
      notice={notice || undefined}
      meta={
        data && (
          <span className="flex flex-wrap items-center gap-x-2">
            {meta?.generatedAt && (
              <span>
                생성 {new Date(meta.generatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                {persisted ? " · 저장돼 있어요(다시 와도 그대로)" : " · 이 화면에서만"}
              </span>
            )}
            {sameInput && <span>· 입력이 그대로예요. 회원 정보가 바뀌면 다시 생성돼요</span>}
          </span>
        )
      }
    >
      {data && (
        <div className="space-y-3">
          {legacyCache && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
              이전 형식 리포트예요. &lsquo;다시 생성&rsquo;을 누르면 새 형식으로 바뀌어요.
            </div>
          )}
          <PrepReport kind="first" data={data} packages={packages} favorites={favorites} />
          <p className="text-[11px] leading-relaxed text-muted">
            ※ 1차도 목표는 <strong className="font-semibold text-primary-strong">오늘 PT 등록</strong>이에요. 클로징의 요청까지 꼭 가세요. 운동 부분은 관찰 전 &lsquo;가설&rsquo;이라 회원 반응을 보며 조정하세요.
          </p>
          {/* 1차 제안 — 클로징 '요청' 직전에 태블릿으로 2~3분. AI 없이 바로 열린다. */}
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft p-2">
            <button type="button" onClick={() => setProposal("present")}
              className="flex min-h-[48px] flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left">
              <Presentation className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-ink">1차 제안 보여주기</span>
                <span className="block text-[12px] text-sub">클로징 요청 직전에 · 같은 목표 회원 사례와 플랜</span>
              </span>
            </button>
            <button type="button" onClick={() => setProposal("edit")} className="min-h-[44px] shrink-0 rounded-lg px-3 text-[12px] font-semibold text-sub hover:bg-card hover:text-ink">편집</button>
          </div>
        </div>
      )}
    </AIBriefBlock>
    {proposal && (
      <FirstProposalLauncher member={member} editable={proposal === "edit"} showToast={showToast} onClose={() => setProposal(null)} />
    )}
    <Toast message={toast} />
    </>
  );
}

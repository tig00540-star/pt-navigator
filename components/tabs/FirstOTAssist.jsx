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
import AIBriefBlock from "@/components/ui/AIBriefBlock";
import PrepReport from "@/components/ot/PrepReport";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { firstInputHash } from "@/lib/otHash";


export default function FirstOTAssist({ member, onSaved }) {
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

  const generate = async () => {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ phase: "first", member, packages, favorites }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setNotice(
          (d.error || "AI 생성에 실패했습니다.") +
            " (① 지원은 데모 폴백이 없어 표시만 생략됩니다.)"
        );
        setData(null);
        return;
      }
      const result = await res.json();
      const newMeta = {
        generatedAt: new Date().toISOString(),
        model: "claude-sonnet-5",
        inputHash: firstInputHash(member),
      };
      setData(result);
      setMeta(newMeta);

      // 캐시 저장 = round-1 행이 있을 때만(Option B). report 병합으로 관찰 데이터 보존.
      if (supabase && member?.id && row1Id) {
        const merged = { ...(row1Report || {}), first_assist: { data: result, meta: newMeta } };
        const { data: up } = await supabase
          .from("ot_log")
          .update({ report: merged }) // .select() 하드닝 — 0행이면 실패
          .eq("id", row1Id)
          .select();
        if (!up || up.length === 0) {
          setNotice("저장에 실패했어요 — 지금은 이 화면에서만 보이고, 다음에 오면 사라질 수 있어요. (권한/정책 확인)");
        } else {
          setRow1Report(merged);
          onSaved?.();
        }
      } else if (supabase && member?.id && !row1Id) {
        // 관찰 저장 전이라도 1차 브리핑을 항상 남긴다 — 빈 1차 행(ot_round=1)을 만들어 붙임(관찰은 나중에 채움).
        const { data: ins } = await supabase
          .from("ot_log")
          .insert({
            user_id: member.id,
            ot_round: 1,
            goal_type: "appearance",
            goal_identified: false,
            closing_result: "none",
            closing_approach: "other",
            report: { first_assist: { data: result, meta: newMeta } },
          })
          .select("id, report");
        if (ins && ins.length) {
          setRow1Id(ins[0].id);
          setRow1Report(ins[0].report || null);
          onSaved?.();
        } else {
          setNotice("저장에 실패했어요 — 지금은 이 화면에서만 보이고, 다음에 오면 사라질 수 있어요. (권한/정책 확인)");
        }
      }
    } catch (e) {
      setNotice("네트워크 오류: " + (e?.message || "알 수 없는 오류"));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

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
  const briefStatus = loading ? "loading" : !data ? "idle" : stale ? "stale" : "ready";

  return (
    <AIBriefBlock
      status={briefStatus}
      title="오늘의 OT 사전 준비 리포트"
      generateLabel="OT 준비 리포트 만들기"
      idleDescription="1차 OT도 목표는 오늘 PT 등록이에요. 회원 정보와 내 PT 패키지·즐겨찾기 자료로 수업 직전 3분에 볼 리포트를 만들어요 — 맨 위 30초 요약, 그다음 입장 · 운동 · 클로징 · 거절 대응 순서예요."
      waitingHint="최대 1분 걸릴 수 있어요. 기다리는 동안 회원 문진표를 다시 훑어보세요. (관찰이 아니라 ‘가설’을 만드는 중)"
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
            {sameInput && <span>· 입력이 그대로예요 — 회원 정보가 바뀌면 다시 생성돼요</span>}
          </span>
        )
      }
    >
      {data && (
        <div className="space-y-3">
          {legacyCache && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
              이전 형식 리포트예요 — &lsquo;다시 생성&rsquo;을 누르면 새 형식으로 바뀝니다.
            </div>
          )}
          <PrepReport kind="first" data={data} packages={packages} favorites={favorites} />
          <p className="text-[11px] leading-relaxed text-muted">
            ※ 1차도 목표는 오늘 PT 등록이에요 — 클로징의 요청까지 꼭 가세요. 운동 부분은 관찰 전 &lsquo;가설&rsquo;이라 회원 반응을 보며 조정하세요.
          </p>
        </div>
      )}
    </AIBriefBlock>
  );
}

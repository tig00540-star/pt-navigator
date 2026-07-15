"use client";

/* =========================================================================
   탭1 · ① AI 1차 OT 지원 블록 (Sonnet + 내 패키지 주입) — 사전무장 컨닝페이퍼.
   기본정보 + 내 active 패키지 → /api/ot-brief {phase:"first"} → 4블록:
   ① opening ② target_exercise ③ sales_metaphor ④ closing_line + 거절 5방어(objection_defense).
   추천 가격은 AI가 준 pick_ref로 내 패키지 목록에서 조회해 렌더(AI는 번호만 = 환각 방지).
   ⚠️ 데모 폴백 없음. 캐시 = ot_log round-1 `report.first_assist`(관찰 데이터와 공존 · 병합 저장).
   round-1 행이 없으면(관찰 저장 전) 캐시 스킵 = 세션 전용. inputHash로 스테일 감지(회원 데이터 변경 시).
   구 스키마 캐시(arc·movement_cues 등, 신필드 전무)는 legacyCache로 감지 → '이전 형식' 안내 + '다시 생성'으로 갱신.
   ========================================================================= */

import { useEffect, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  CreditCard,
  Flag,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { won } from "@/lib/format";
import { firstInputHash } from "@/lib/otHash";

// 거절 이유 한글 라벨(purge-safe 정적 맵). objection_defense[].reason 5키와 물림.
const OBJ_LABEL = {
  price: "가격 부담",
  hesitation: "생각해볼게요 (망설임)",
  doubt: "효과·필요성 의심",
  time: "시간 부족",
  compare: "타 센터 비교",
};

export default function FirstOTAssist({ member }) {
  const [data, setData] = useState(null); // ① brief JSON (캐시 또는 세션)
  const [meta, setMeta] = useState(null); // { generatedAt, model, inputHash }
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(""); // 실패/키미설정/세션전용 안내
  const [row1Id, setRow1Id] = useState(null); // round-1 행 id (없으면 캐시 스킵)
  const [row1Report, setRow1Report] = useState(null); // round-1 report(병합 대상 — 관찰 보존)
  const [packages, setPackages] = useState([]); // 본인 active 패키지(추천 재료 · pick_ref 조회)

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
        body: JSON.stringify({ phase: "first", member, packages }),
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
        }
      } else if (supabase && member?.id && !row1Id) {
        setNotice("지금은 이 화면에서만 보여요 — 관찰 기록을 저장하고 다시 생성하면 계속 남습니다.");
      }
    } catch (e) {
      setNotice("네트워크 오류: " + (e?.message || "unknown"));
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

  const mr = data?.member_read || "";
  const op = data?.opening || {};
  const te = data?.target_exercise || {};
  const sm = data?.sales_metaphor || {};
  const cline = data?.closing_line || "";
  const obj = Array.isArray(data?.objection_defense) ? data.objection_defense : [];
  const rp = data?.recommended_program || {};
  const pick = Number.isInteger(rp.pick_ref) ? (packages[rp.pick_ref] || null) : null;
  const alt = Number.isInteger(rp.alt_ref) ? (packages[rp.alt_ref] || null) : null;
  const perSession = (p) => (p && p.sessions ? won(Math.round(p.price / p.sessions)) : null);
  const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps : [];
  // 구캐시(구 스키마) 감지 — 신필드 전무면 '이전 형식' 안내 후 재생성 유도.
  const legacyCache = Boolean(data) && !op.line && !te.exercise && obj.length === 0;

  return (
    <section className="rounded-2xl border border-line bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow icon={Sparkles}>① AI 1차 OT 지원 (가설)</Eyebrow>
        <Button
          variant={sameInput && !loading ? "ghost" : "primary"}
          size="md"
          onClick={generate}
          disabled={loading}
          title={sameInput ? "회원 정보가 바뀌면 다시 생성하세요 (지금은 같은 입력)" : undefined}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.5} /> {loading ? "생성 중…" : data ? "다시 생성" : "AI 지원 생성"}
        </Button>
      </div>

      {/* 캐시/스테일 상태 */}
      {data && !loading && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] leading-relaxed text-muted">
          {meta?.generatedAt && (
            <span>
              생성 {new Date(meta.generatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
              {persisted ? " · 저장돼 있어요(다시 와도 그대로)" : " · 이 화면에서만"}
            </span>
          )}
          {stale && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700">
              ⚠️ 회원 정보 변경됨 — 다시 생성 권장
            </span>
          )}
          {sameInput && (
            <span className="text-muted">· 입력이 그대로예요 — 회원 정보가 바뀌면 다시 생성돼요</span>
          )}
        </div>
      )}

      {/* 로딩 — 핵심3줄 스켈레톤 (탭 얼어붙는 느낌 방지) */}
      {loading && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] leading-relaxed text-muted">
            생성 중… 최대 1분 걸릴 수 있어요. (관찰이 아니라 &lsquo;가설&rsquo;을 만드는 중)
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-line bg-card shadow-sm p-4"
              >
                <div className="h-3 w-24 rounded bg-elevate" />
                <div className="mt-2 h-3 w-3/4 rounded bg-elevate" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 실패/키미설정 — 데모 폴백 없이 미표시 안내만 */}
      {notice && !loading && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          {notice}
        </div>
      )}

      {data && !loading && (
        <div className="mt-4 space-y-3">
          {legacyCache && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
              이전 형식 브리핑이에요 — &lsquo;다시 생성&rsquo;을 누르면 새 사전무장 컨닝페이퍼로 바뀝니다.
            </div>
          )}

          {/* 앵커 — 3분 각인 */}
          {mr && (
            <div className="rounded-xl border border-line bg-elevate p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <Sparkles className="h-3.5 w-3.5" /> 3분 각인
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink">{mr}</p>
            </div>
          )}

          {/* ① 오프닝 */}
          {op.line && (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">👋</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">오프닝 · 긴장 풀기</span>
              </div>
              <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-ink">&ldquo;{op.line}&rdquo;</p>
              {op.why && <p className="mt-1 text-[11px] leading-relaxed text-muted">{op.why}</p>}
            </div>
          )}

          {/* ② 타겟 운동 & 리액션 — 증거 동작 2개 (구 단일캐시 폴백) */}
          {(() => {
            const moves = Array.isArray(te.moves)
              ? te.moves
              : (te.exercise ? [{ exercise: te.exercise, target_reaction: te.target_reaction, point_it_out: te.point_it_out }] : []);
            if (moves.length === 0) return null;
            return (
              <div className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">타겟 운동 · 증거 만들기</span>
                </div>
                <div className="mt-2 space-y-3">
                  {moves.map((mv, i) => (
                    <div key={i} className={i > 0 ? "border-t border-line pt-3" : ""}>
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-strong">증거 {i + 1}</span>
                        {mv.exercise && <p className="text-sm font-semibold text-ink">{mv.exercise}</p>}
                      </div>
                      {mv.target_reaction && (
                        <p className="mt-1 text-[13px] leading-relaxed text-sub"><span className="font-semibold">노릴 반응 · </span>{mv.target_reaction}</p>
                      )}
                      {mv.point_it_out && (
                        <p className="mt-1.5 rounded-lg bg-primary-soft px-3 py-2 text-sm leading-relaxed text-ink">
                          <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">짚어줄 말</span>
                          &ldquo;{mv.point_it_out}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {te.so_what && (
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted"><span className="font-semibold text-sub">등록 논리 · </span>{te.so_what}</p>
                )}
              </div>
            );
          })()}

          {/* ③ 세일즈 비유 */}
          {sm.metaphor && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">💬</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">세일즈 비유</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">&ldquo;{sm.metaphor}&rdquo;</p>
              {sm.bridge && <p className="mt-1 text-[12px] leading-relaxed text-muted">{sm.bridge}</p>}
            </div>
          )}

          {/* 추천 프로그램 — 클로징 직전에 배치 · 왜 이 횟수 근거(가격은 내 목록에서) */}
          {pick ? (
            <div className="rounded-xl border border-primary/30 bg-card p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-primary-strong" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">추천 프로그램 · 왜 이 횟수</span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
                <span className="font-bold">{pick.name}</span>
                <span className="font-mono font-semibold">{won(pick.price)}</span>
                {pick.sessions != null && <span className="text-[11px] text-muted">· {pick.sessions}회</span>}
                {perSession(pick) && <span className="text-[11px] text-muted">· {perSession(pick)}/회</span>}
              </p>
              {rp.why_fit && <p className="mt-1 text-[12px] leading-relaxed text-sub">{rp.why_fit}</p>}
              {(rp.frequency || rp.duration || rp.session_logic) && (
                <div className="mt-2 space-y-1 rounded-lg bg-elevate px-3 py-2">
                  {rp.frequency && <p className="text-[12px] leading-relaxed text-sub"><span className="font-semibold text-primary-strong">빈도 · </span>{rp.frequency}</p>}
                  {rp.duration && <p className="text-[12px] leading-relaxed text-sub"><span className="font-semibold text-primary-strong">기간 · </span>{rp.duration}</p>}
                  {rp.session_logic && <p className="text-[12px] leading-relaxed text-ink"><span className="font-semibold text-primary-strong">그래서 · </span>{rp.session_logic}</p>}
                </div>
              )}
              {alt && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  <span className="rounded bg-elevate px-1.5 py-0.5 font-semibold">대안</span> {alt.name} · {won(alt.price)}{rp.alt_why ? ` — ${rp.alt_why}` : ""}
                </p>
              )}
            </div>
          ) : packages.length === 0 ? (
            <div className="rounded-xl border border-line bg-card p-4 text-[12px] leading-relaxed text-muted">
              가격 설정 탭에서 패키지를 등록하면 이 회원에게 맞는 프로그램을 추천해드려요.
            </div>
          ) : null}

          {/* ④ 클로징 한마디 — 크게(L0) */}
          {cline && (
            <div className="rounded-xl border border-primary/40 bg-primary-soft p-4">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-primary-strong" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">클로징 한마디</span>
              </div>
              <p className="mt-1.5 text-base font-semibold leading-relaxed text-ink">&ldquo;{cline}&rdquo;</p>
            </div>
          )}

          {/* 거절 5방어 — 기본 펼침(현장 핵심) */}
          {obj.length > 0 && (
            <details open className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <ShieldCheck className="h-3.5 w-3.5 text-primary-strong" /> 거절 선제 방어 ({obj.length})
              </summary>
              <div className="space-y-2 px-3.5 pb-3.5">
                {obj.map((o, i) => (
                  <div key={i} className="rounded-lg border border-line bg-elevate p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-card px-2 py-0.5 text-[10px] font-semibold text-sub">{OBJ_LABEL[o.reason] || o.reason}</span>
                      {o.trigger && <span className="text-[11px] italic text-muted">&ldquo;{o.trigger}&rdquo;</span>}
                    </div>
                    {o.defense && (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-sub"><span className="font-semibold text-sub">대응 · </span>{o.defense}</p>
                    )}
                    {o.line && (
                      <p className="mt-1.5 rounded-md bg-primary-soft px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">
                        <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>
                        &ldquo;{o.line}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* data_gaps — 접힘 */}
          {gaps.length > 0 && (
            <details className="rounded-xl border border-primary/30 bg-primary-soft p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-primary-strong">
                이렇게 하면 더 좋아져요 (선택 · {gaps.length})
              </summary>
              <ul className="mt-3 space-y-1.5">
                {gaps.map((gp, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-sub"><span className="mt-0.5 text-primary-strong">＋</span> {gp}</li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[10px] leading-relaxed text-muted">
            ※ 관찰 전 &lsquo;가설&rsquo;이에요 — 현장에서 회원 반응 보며 조정하세요. 관찰 기록을 저장한 회원은 이 브리핑이 남습니다.
          </p>
        </div>
      )}

      {/* 최초 안내 (생성 전) */}
      {!data && !loading && !notice && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          회원 기본정보 + 내 패키지로 <b>3분 사전무장</b>을 만듭니다 — 오프닝 · 타겟운동 · 세일즈 비유 · 클로징 한마디 · 거절 5방어. (관찰 아님 · 가설)
        </p>
      )}
    </section>
  );
}

"use client";

/* =========================================================================
   탭1 · ① AI 1차 OT 지원 블록 (B-2: Sonnet + 내 패키지 주입).
   기본정보 + 내 active 패키지 → /api/ot-brief {phase:"first"} → 6단계 arc·movement_cues
   ·recommended_program·closing(4단계)·objections(거절 4종). 화면: 핵심 3줄(💳🎯📍 · 항상 보임) + 펼치기.
   추천 가격은 AI가 준 pick_ref로 내 패키지 목록에서 조회해 렌더(AI는 번호만 = 환각 방지).
   ⚠️ 데모 폴백 없음. 캐시 = ot_log round-1 `report.first_assist`(관찰 데이터와 공존 · 병합 저장).
   round-1 행이 없으면(관찰 저장 전) 캐시 스킵 = 세션 전용. inputHash로 스테일 감지(회원 데이터 변경 시).
   example·cueing·dialogue는 '발판(예시)'이라 흐림 처리(낭독 대본 방지).
   구 Haiku 캐시(closing_compass 有·recommended_program 無)는 신필드 섹션이 조용히 비고 arc·치트키만 뜸 → '다시 생성'으로 갱신.
   ========================================================================= */

import { useEffect, useState } from "react";
import {
  Sparkles,
  MessageSquareQuote,
  ShieldCheck,
  Dumbbell,
  Zap,
  Lightbulb,
  Target,
  CreditCard,
  Flag,
  MessageSquare,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { supabase } from "@/lib/supabaseClient";
import { won } from "@/lib/format";
import { CLOSING_APPROACH_OPTS, labelOf } from "@/lib/labels";
import { firstInputHash } from "@/lib/otHash";

// 거절 이유 한글 라벨(purge-safe 정적 맵). B-1 objections[].reason 키와 물림.
const OBJ_LABEL = {
  hesitation: "생각해볼게요 (망설임)",
  price: "가격 부담",
  decider: "배우자·가족과 상의",
  doubt: "효과·필요성 의심",
};

// example / cueing / dialogue = '발판(예시)' → 흐림 + "예시" 라벨 (낭독기 방지).
const Example = ({ text }) =>
  text ? (
    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
      <span className="mr-1 rounded bg-elevate px-1 py-0.5 text-[9px] font-semibold text-muted">
        예시
      </span>
      {text}
    </p>
  ) : null;

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
        headers: { "Content-Type": "application/json" },
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

  // 핵심 3줄용 한 줄 요약(풀텍스트 금지 — 펼치기로).
  const oneLine = (s, n = 60) => {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  };

  // 신스키마 defensive 접근 (필드 일부 누락·구 캐시에도 크래시 없이).
  const mc = data?.movement_cues || {};
  const rp = data?.recommended_program || {};
  const cl = data?.closing || {};
  const obj = Array.isArray(data?.objections) ? data.objections : [];
  // pick_ref/alt_ref로 실제 패키지 조회(범위 밖·null이면 null). 가격 숫자는 AI가 아니라 내 목록에서.
  const pick = Number.isInteger(rp.pick_ref) ? (packages[rp.pick_ref] || null) : null;
  const alt = Number.isInteger(rp.alt_ref) ? (packages[rp.alt_ref] || null) : null;
  const perSession = (p) => (p && p.sessions ? won(Math.round(p.price / p.sessions)) : null);
  const arc = Array.isArray(data?.arc) ? data.arc : [];
  const beatBy = (kw) => arc.find((b) => (b?.when || "").includes(kw)) || null;
  const awareBeat = beatBy("자각");
  const observe = Array.isArray(data?.observe_targets) ? data.observe_targets : [];
  const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps : [];

  return (
    <section className="rounded-2xl border border-line bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow icon={Sparkles}>① AI 1차 OT 지원 (가설)</Eyebrow>
        <button
          onClick={generate}
          disabled={loading}
          title={sameInput ? "회원 정보가 바뀌면 다시 생성하세요 (지금은 같은 입력)" : undefined}
          className={
            sameInput && !loading
              ? "flex items-center gap-2 rounded-lg border border-line bg-elevate px-4 py-2 text-sm font-semibold text-sub transition active:scale-95"
              : "flex items-center gap-2 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
          }
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.5} />
          {loading ? "생성 중…" : data ? "다시 생성" : "AI 지원 생성"}
        </button>
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
        <div className="mt-4 space-y-4">
          {/* ================= 핵심 3줄 (항상 보임 · 3초 스캔) ================= */}
          <div className="space-y-2.5">
            {/* 💳 추천 프로그램 */}
            <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base">💳</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">
                  추천 프로그램
                </span>
              </div>
              {pick ? (
                <>
                  <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
                    <span className="font-bold">{pick.name}</span>
                    <span className="font-mono font-semibold">{won(pick.price)}</span>
                    {perSession(pick) && <span className="text-[11px] text-muted">· {perSession(pick)}/회</span>}
                  </p>
                  {rp.why_fit && (
                    <p className="mt-1 text-[12px] leading-relaxed text-sub">{oneLine(rp.why_fit, 62)}</p>
                  )}
                </>
              ) : packages.length === 0 ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                  가격 설정 탭에서 패키지를 등록하면 이 회원에게 맞는 프로그램을 추천해드려요.
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-muted">추천을 콕 집지 못했어요 — &lsquo;다시 생성&rsquo;을 눌러보세요.</p>
              )}
            </div>

            {/* 🎯 오늘의 승부처 */}
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
                  오늘의 승부처
                </span>
              </div>
              {data.hypothesis && (
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{data.hypothesis}</p>
              )}
              {awareBeat?.direction && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-sky-700/90">
                  <span className="font-semibold text-sky-700">자각 포인트 · </span>
                  {oneLine(awareBeat.direction, 84)}
                </p>
              )}
            </div>

            {/* 📍 클로징 진입 */}
            <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">📍</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">
                  클로징 진입
                </span>
              </div>
              {cl.enter ? (
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  {oneLine(cl.enter, 84)}
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-muted">클로징 진입은 아래 상세에서.</p>
              )}
            </div>
          </div>

          {/* ================= 펼치기 (접힘 기본) ================= */}
          {/* 추천 프로그램 상세 — 베스트 + 대안. 가격 숫자는 내 목록(pick/alt)에서. */}
          {packages.length > 0 && (pick || alt) && (
            <details className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <CreditCard className="h-3.5 w-3.5 text-primary-strong" /> 추천 프로그램
              </summary>
              <div className="space-y-3 px-3.5 pb-3.5">
                {pick && (() => {
                  const disc = pick.list_price != null && pick.list_price > pick.price;
                  return (
                    <div className="rounded-lg border border-primary/30 bg-primary-soft p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink">{pick.name}</span>
                        {pick.sessions != null && (
                          <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">{pick.sessions}회</span>
                        )}
                        {pick.duration_label && (
                          <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-sub">{pick.duration_label}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-mono text-lg font-bold text-ink">{won(pick.price)}</span>
                        {disc && (
                          <>
                            <span className="font-mono text-xs text-muted line-through">{won(pick.list_price)}</span>
                            <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold text-primary-strong">
                              -{Math.round((1 - pick.price / pick.list_price) * 100)}%
                            </span>
                          </>
                        )}
                        {perSession(pick) && <span className="text-[11px] text-muted">{perSession(pick)}/회</span>}
                      </div>
                      {rp.why_fit && (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-sub">
                          <span className="font-semibold text-sub">왜 맞나 · </span>{rp.why_fit}
                        </p>
                      )}
                    </div>
                  );
                })()}
                {alt && (
                  <div className="rounded-lg border border-line bg-elevate p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">대안</span>
                      <span className="text-sm font-semibold text-ink">{alt.name}</span>
                      <span className="font-mono text-sm font-semibold text-ink">{won(alt.price)}</span>
                    </div>
                    {rp.alt_why && (
                      <p className="mt-1 text-[12px] leading-relaxed text-sub">{oneLine(rp.alt_why, 80)}</p>
                    )}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* 클로징 4단계 — 진입→그림→착지→침묵 + 안전핀(watch_for). */}
          {(cl.enter || cl.paint || cl.land || cl.hold) && (
            <details className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <Flag className="h-3.5 w-3.5 text-primary-strong" /> 클로징 4단계
                {cl.approach_tag && (
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-strong">
                    {labelOf(CLOSING_APPROACH_OPTS, cl.approach_tag)}
                  </span>
                )}
              </summary>
              <div className="space-y-2.5 px-3.5 pb-3.5">
                {[
                  { k: "진입", v: cl.enter, say: true },
                  { k: "그림", v: cl.paint, say: true },
                  { k: "착지", v: cl.land, say: true },
                  { k: "침묵", v: cl.hold, say: false }, // 지시문이라 따옴표 없음
                ].map((s) => s.v ? (
                  <div key={s.k} className="rounded-lg border border-line bg-elevate p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-strong">{s.k}</div>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink">{s.say ? <>&ldquo;{s.v}&rdquo;</> : s.v}</p>
                  </div>
                ) : null)}
                {cl.watch_for && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> 안 통할 신호 = 안전핀 (밀지 말고 2차로)
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-sub">{cl.watch_for}</p>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                      ※ 미루기는 &lsquo;포기&rsquo;가 아니라 1차↔2차를 잇는 다리 — 관찰기록을 남기면 2차 AI가 더 강한 클로징을 준비합니다.
                    </p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* 거절 대응 4종 — 공감 방향 + 세일즈 무브. */}
          {obj.length > 0 && (
            <details className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <MessageSquare className="h-3.5 w-3.5 text-primary-strong" /> 거절 대응 ({obj.length})
              </summary>
              <div className="space-y-2 px-3.5 pb-3.5">
                {obj.map((o, i) => (
                  <div key={i} className="rounded-lg border border-line bg-elevate p-3">
                    <span className="inline-block rounded-md bg-card px-2 py-0.5 text-[10px] font-semibold text-sub">
                      {OBJ_LABEL[o.reason] || o.reason}
                    </span>
                    {o.customer_says && (
                      <p className="mt-1.5 text-[12px] italic leading-relaxed text-muted">회원: &ldquo;{o.customer_says}&rdquo;</p>
                    )}
                    {o.reframe_direction && (
                      <p className="mt-1 text-sm leading-relaxed text-ink">
                        <span className="font-semibold text-sub">공감 · </span>{o.reframe_direction}
                      </p>
                    )}
                    {o.sales_move && (
                      <p className="mt-1 text-[13px] leading-relaxed text-sub">
                        <span className="font-semibold text-sub">세일즈 · </span>{o.sales_move}
                      </p>
                    )}
                    {o.example && (
                      <p className="mt-1.5 rounded-md bg-primary-soft px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">
                        <span className="mr-1 rounded bg-card px-1 py-0.5 text-[9px] font-semibold text-primary-strong">멘트</span>
                        &ldquo;{o.example}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 전체 arc */}
          {arc.length > 0 && (
            <details className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <MessageSquareQuote className="h-3.5 w-3.5 text-primary-strong" /> 1차 대화 흐름 · 6단계 arc ({arc.length})
              </summary>
              <div className="space-y-2 px-3.5 pb-3.5">
                {arc.map((b, i) => (
                  <div key={i} className="rounded-lg border border-line bg-elevate p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong">
                        {b.when}
                      </span>
                      {b.tone && (
                        <span className="rounded-md bg-elevate px-2 py-0.5 text-[10px] text-sub">
                          🗣 {b.tone}
                        </span>
                      )}
                    </div>
                    {b.intent && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                        <span className="text-sub">왜: </span>
                        {b.intent}
                      </p>
                    )}
                    {b.direction && (
                      <p className="mt-1 text-sm leading-relaxed text-ink">{b.direction}</p>
                    )}
                    <Example text={b.example} />
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 치트키 — movement_cues 6필드 */}
          {(mc.exercise || mc.principle || mc.why_instant) && (
            <details className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <Dumbbell className="h-3.5 w-3.5 text-primary-strong" /> 치트키 운동 (즉효 체감 1개)
              </summary>
              <div className="space-y-2.5 px-3.5 pb-3.5">
                {mc.exercise && (
                  <p className="text-sm font-semibold leading-relaxed text-ink">{mc.exercise}</p>
                )}
                {mc.why_instant && (
                  <p className="flex gap-1.5 text-[13px] leading-relaxed text-sub">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                    {mc.why_instant}
                  </p>
                )}
                {mc.cueing && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      현장 큐잉
                    </div>
                    <Example text={mc.cueing} />
                  </div>
                )}
                {mc.dialogue && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      함께 건넬 말
                    </div>
                    <Example text={mc.dialogue} />
                  </div>
                )}
                {mc.connects_to_closing && (
                  <p className="text-[13px] leading-relaxed text-sub">
                    <span className="font-semibold text-sub">클로징 연결 · </span>
                    {mc.connects_to_closing}
                  </p>
                )}
                {mc.principle && (
                  <div className="rounded-lg border border-primary/30 bg-primary-soft p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-strong">
                      <Lightbulb className="h-3.5 w-3.5" /> 원리 (같은 원리로 본인 필살기에 응용)
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink">{mc.principle}</p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* 관찰해올 것 — observe_targets (관찰기록 탭 수동 이관) */}
          {observe.length > 0 && (
            <details className="rounded-xl border border-line bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-sub">
                <Target className="h-3.5 w-3.5 text-primary-strong" /> 1차에서 관찰해올 것 ({observe.length})
              </summary>
              <div className="px-3.5 pb-3.5">
                <ul className="space-y-1.5">
                  {observe.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
                      <span className="text-primary-strong">·</span> {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  → &lsquo;관찰 기록&rsquo; 탭에 이 항목들을 관찰해 입력하면 2차 AI 브리핑의 근거가 됩니다.
                </p>
              </div>
            </details>
          )}

          {/* data_gaps — 있을 때만 · 긍정 코칭(결핍 아님) */}
          {gaps.length > 0 && (
            <details className="rounded-xl border border-primary/30 bg-primary-soft p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-primary-strong">
                이렇게 하면 더 좋아져요 (선택 · {gaps.length})
              </summary>
              <ul className="mt-3 space-y-1.5">
                {gaps.map((gp, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-sub">
                    <span className="mt-0.5 text-primary-strong">＋</span> {gp}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[10px] leading-relaxed text-muted">
            ※ ①은 회원 기본정보로 만든 &lsquo;가설&rsquo;이에요. 관찰 기록을 저장한 회원은 만든 ①이 남고, 저장 전이면 이 화면에서만 보여요.
          </p>
        </div>
      )}

      {/* 최초 안내 (생성 전) */}
      {!data && !loading && !notice && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          회원 기본정보 + 내 패키지로 1차 OT 6단계 흐름 · 추천 프로그램 · 클로징 4단계 · 거절 대응을 생성합니다. (관찰 아님 · 가설)
        </p>
      )}
    </section>
  );
}

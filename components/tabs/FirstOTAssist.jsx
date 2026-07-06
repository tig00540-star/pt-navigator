"use client";

/* =========================================================================
   탭1 · ① AI 1차 OT 지원 블록 (추가형 — 탭1 legacy 스캐폴드는 이 커밋에서 미삭제).
   기본정보 → /api/ot-brief {phase:"first"} (S4 확정본) → 6단계 arc·movement_cues
   ·closing_compass·soft_closing. 화면: 핵심 3줄(🧭🎯📍 · 항상 보임) + 펼치기 4개.
   ⚠️ 데모 폴백 없음. 캐시 = ot_log round-1 `report.first_assist`(관찰 데이터와 공존 · 병합 저장).
   round-1 행이 없으면(관찰 저장 전) 캐시 스킵 = 세션 전용. inputHash로 스테일 감지(회원 데이터 변경 시).
   example·cueing·dialogue는 '발판(예시)'이라 흐림 처리(낭독 대본 방지).
   ========================================================================= */

import { useEffect, useState } from "react";
import {
  Sparkles,
  MessageSquareQuote,
  Handshake,
  ShieldCheck,
  Dumbbell,
  Zap,
  Lightbulb,
  Target,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { supabase } from "@/lib/supabaseClient";
import { CLOSING_APPROACH_OPTS, labelOf } from "@/lib/labels";
import { firstInputHash } from "@/lib/otHash";

export default function FirstOTAssist({ member }) {
  const [data, setData] = useState(null); // ① brief JSON (캐시 또는 세션)
  const [meta, setMeta] = useState(null); // { generatedAt, model, inputHash }
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(""); // 실패/키미설정/세션전용 안내
  const [row1Id, setRow1Id] = useState(null); // round-1 행 id (없으면 캐시 스킵)
  const [row1Report, setRow1Report] = useState(null); // round-1 report(병합 대상 — 관찰 보존)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const generate = async () => {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "first", member }),
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
        model: "claude-haiku-4-5-20251001",
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

  // example / cueing / dialogue = '발판(예시)' → 흐림 + "예시" 라벨 (낭독기 방지).
  const Example = ({ text }) =>
    text ? (
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
        <span className="mr-1 rounded bg-zinc-800/70 px-1 py-0.5 text-[9px] font-semibold text-zinc-500">
          예시
        </span>
        {text}
      </p>
    ) : null;

  // 핵심 3줄용 한 줄 요약(풀텍스트 금지 — 펼치기로).
  const oneLine = (s, n = 60) => {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  };

  // 신스키마 defensive 접근 (필드 일부 누락에도 크래시 없이).
  const cc = data?.closing_compass || {};
  const mc = data?.movement_cues || {};
  const sc = data?.soft_closing || {};
  const arc = Array.isArray(data?.arc) ? data.arc : [];
  const beatBy = (kw) => arc.find((b) => (b?.when || "").includes(kw)) || null;
  const awareBeat = beatBy("자각");
  const salesBeat = beatBy("세일즈");
  const observe = Array.isArray(data?.observe_targets) ? data.observe_targets : [];
  const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps : [];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow icon={Sparkles}>① AI 1차 OT 지원 (가설)</Eyebrow>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.5} />
          {loading ? "생성 중…" : data ? "다시 생성" : "AI 지원 생성"}
        </button>
      </div>

      {/* 캐시/스테일 상태 */}
      {data && !loading && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] leading-relaxed text-zinc-500">
          {meta?.generatedAt && (
            <span>
              생성 {new Date(meta.generatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
              {persisted ? " · 저장돼 있어요(다시 와도 그대로)" : " · 이 화면에서만"}
            </span>
          )}
          {stale && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
              ⚠️ 회원 정보 변경됨 — 다시 생성 권장
            </span>
          )}
        </div>
      )}

      {/* 로딩 — 핵심3줄 스켈레톤 (탭 얼어붙는 느낌 방지) */}
      {loading && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            생성 중… 최대 1분 걸릴 수 있어요. (관찰이 아니라 &lsquo;가설&rsquo;을 만드는 중)
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div className="h-3 w-24 rounded bg-zinc-800" />
                <div className="mt-2 h-3 w-3/4 rounded bg-zinc-800/70" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 실패/키미설정 — 데모 폴백 없이 미표시 안내만 */}
      {notice && !loading && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
          {notice}
        </div>
      )}

      {data && !loading && (
        <div className="mt-4 space-y-4">
          {/* ================= 핵심 3줄 (항상 보임 · 3초 스캔) ================= */}
          <div className="space-y-2.5">
            {/* 🧭 세일즈 나침반 */}
            <div className="rounded-xl border border-lime-500/25 bg-lime-500/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base">🧭</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                  세일즈 나침반
                </span>
                {cc.approach_tag && (
                  <span className="rounded-md bg-lime-500/15 px-2 py-0.5 text-[11px] font-bold text-lime-300">
                    {labelOf(CLOSING_APPROACH_OPTS, cc.approach_tag)}
                  </span>
                )}
              </div>
              {cc.why_higher_odds && (
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
                  {oneLine(cc.why_higher_odds, 62)}
                  <span className="ml-1 text-[11px] text-zinc-500">
                    (풀텍스트는 &lsquo;세일즈 상세&rsquo;)
                  </span>
                </p>
              )}
            </div>

            {/* 🎯 오늘의 승부처 */}
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                  오늘의 승부처
                </span>
              </div>
              {data.hypothesis && (
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{data.hypothesis}</p>
              )}
              {awareBeat?.direction && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-sky-200/90">
                  <span className="font-semibold text-sky-300">자각 포인트 · </span>
                  {oneLine(awareBeat.direction, 84)}
                </p>
              )}
            </div>

            {/* 📍 클로징 타이밍 */}
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">📍</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  클로징 타이밍
                </span>
              </div>
              {salesBeat ? (
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
                  {oneLine(salesBeat.intent || salesBeat.direction, 84)}
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-zinc-500">
                  &lsquo;세일즈&rsquo; 비트가 아직 없어요.
                </p>
              )}
            </div>
          </div>

          {/* ================= 펼치기 4개 (접힘 기본) ================= */}
          {/* 전체 arc */}
          {arc.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <MessageSquareQuote className="h-3.5 w-3.5 text-lime-400" /> 1차 대화 흐름 · 6단계 arc ({arc.length})
              </summary>
              <div className="space-y-2 px-3.5 pb-3.5">
                {arc.map((b, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                        {b.when}
                      </span>
                      {b.tone && (
                        <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">
                          🗣 {b.tone}
                        </span>
                      )}
                    </div>
                    {b.intent && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                        <span className="text-zinc-400">왜: </span>
                        {b.intent}
                      </p>
                    )}
                    {b.direction && (
                      <p className="mt-1 text-sm leading-relaxed text-zinc-200">{b.direction}</p>
                    )}
                    <Example text={b.example} />
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 세일즈 상세 — closing_compass 풀 + soft_closing */}
          {(cc.why_higher_odds || cc.watch_for || sc.logic || sc.example) && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Handshake className="h-3.5 w-3.5 text-lime-400" /> 세일즈 상세 · 나침반 풀
              </summary>
              <div className="space-y-3 px-3.5 pb-3.5">
                {cc.why_higher_odds && (
                  <div>
                    <div className="text-[11px] font-semibold text-lime-400">
                      왜 이 방향인가 (압박 아니라 공감 근거)
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-200">{cc.why_higher_odds}</p>
                  </div>
                )}
                {cc.watch_for && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                      <ShieldCheck className="h-3.5 w-3.5" /> 안 통할 신호 = 안전핀 (밀지 말고 2차로)
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{cc.watch_for}</p>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                      ※ 미루기는 &lsquo;포기&rsquo;가 아니라 1차↔2차를 잇는 다리 — 관찰기록을 남기면 2차 AI가 더 강한 클로징을 준비합니다.
                    </p>
                  </div>
                )}
                {(sc.logic || sc.example) && (
                  <div>
                    <div className="text-[11px] font-semibold text-lime-400">
                      부담 없는 1차 마무리
                      {sc.approach_tag ? ` · ${labelOf(CLOSING_APPROACH_OPTS, sc.approach_tag)}` : ""}
                    </div>
                    {sc.logic && (
                      <p className="mt-1 text-sm leading-relaxed text-zinc-200">{sc.logic}</p>
                    )}
                    <Example text={sc.example} />
                  </div>
                )}
              </div>
            </details>
          )}

          {/* 치트키 — movement_cues 6필드 */}
          {(mc.exercise || mc.principle || mc.why_instant) && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Dumbbell className="h-3.5 w-3.5 text-lime-400" /> 치트키 운동 (즉효 체감 1개)
              </summary>
              <div className="space-y-2.5 px-3.5 pb-3.5">
                {mc.exercise && (
                  <p className="text-sm font-semibold leading-relaxed text-zinc-100">{mc.exercise}</p>
                )}
                {mc.why_instant && (
                  <p className="flex gap-1.5 text-[13px] leading-relaxed text-zinc-300">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    {mc.why_instant}
                  </p>
                )}
                {mc.cueing && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      현장 큐잉
                    </div>
                    <Example text={mc.cueing} />
                  </div>
                )}
                {mc.dialogue && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      함께 건넬 말
                    </div>
                    <Example text={mc.dialogue} />
                  </div>
                )}
                {mc.connects_to_closing && (
                  <p className="text-[13px] leading-relaxed text-zinc-300">
                    <span className="font-semibold text-zinc-400">클로징 연결 · </span>
                    {mc.connects_to_closing}
                  </p>
                )}
                {mc.principle && (
                  <div className="rounded-lg border border-lime-500/20 bg-lime-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-lime-400">
                      <Lightbulb className="h-3.5 w-3.5" /> 원리 (같은 원리로 본인 필살기에 응용)
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{mc.principle}</p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* 관찰해올 것 — observe_targets (관찰기록 탭 수동 이관) */}
          {observe.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40">
              <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Target className="h-3.5 w-3.5 text-lime-400" /> 1차에서 관찰해올 것 ({observe.length})
              </summary>
              <div className="px-3.5 pb-3.5">
                <ul className="space-y-1.5">
                  {observe.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-200">
                      <span className="text-lime-400">·</span> {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  → &lsquo;관찰 기록&rsquo; 탭에 이 항목들을 관찰해 입력하면 2차 AI 브리핑의 근거가 됩니다.
                </p>
              </div>
            </details>
          )}

          {/* data_gaps — 있을 때만 · 긍정 코칭(결핍 아님) */}
          {gaps.length > 0 && (
            <details className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-lime-400">
                이렇게 하면 더 좋아져요 (선택 · {gaps.length})
              </summary>
              <ul className="mt-3 space-y-1.5">
                {gaps.map((gp, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-zinc-400">
                    <span className="mt-0.5 text-lime-400">＋</span> {gp}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[10px] leading-relaxed text-zinc-600">
            ※ ①은 회원 기본정보로 만든 &lsquo;가설&rsquo;이에요. 관찰 기록을 저장한 회원은 만든 ①이 남고, 저장 전이면 이 화면에서만 보여요.
          </p>
        </div>
      )}

      {/* 최초 안내 (생성 전) */}
      {!data && !loading && !notice && (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          회원 기본정보로 1차 OT 6단계 흐름 · 세일즈 나침반 · 치트키를 생성합니다. (관찰 아님 · 가설)
        </p>
      )}
    </section>
  );
}

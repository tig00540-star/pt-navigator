"use client";

/* =========================================================================
   탭1 · ① AI 1차 OT 지원 블록 (추가형 — 탭1 기존 하드코딩은 건드리지 않음)
   기본정보 + 사전메모(비저장) → /api/ot-brief {phase:"first"} → 가설·observe_targets
   ·arc·soft_closing. 캐시 없음(세션 재생성). example는 흐리게(낭독기 방지).
   ========================================================================= */

import { useState } from "react";
import { Handshake, Lightbulb, Sparkles, Target } from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { CLOSING_APPROACH_OPTS, labelOf } from "@/lib/labels";

export default function FirstOTAssist({ member }) {
  const [preNote, setPreNote] = useState("");
  const [data, setData] = useState(null); // ① brief JSON
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(""); // 실패/데모 안내

  const generate = async () => {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/ot-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "first", member, preNote }),
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
      setData(await res.json());
    } catch (e) {
      setNotice("네트워크 오류: " + (e?.message || "unknown"));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // example(예시 문장)은 흐리게 + "예시" 라벨 — 낭독기 방지.
  const renderExample = (ex) =>
    ex ? (
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
        <span className="mr-1 rounded bg-zinc-800/70 px-1 py-0.5 text-[9px] font-semibold text-zinc-500">
          예시
        </span>
        {ex}
      </p>
    ) : null;

  const gaps = Array.isArray(data?.data_gaps) ? data.data_gaps : [];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <Eyebrow icon={Sparkles}>① AI 1차 OT 지원 (가설)</Eyebrow>

      <label className="mb-1 block text-[11px] font-medium text-zinc-500">
        사전 메모 / 인바디 요약 (선택)
      </label>
      <textarea
        value={preNote}
        onChange={(e) => setPreNote(e.target.value)}
        rows={3}
        placeholder="회원이 종이에 써온 인바디·문진 내용, 데스크 메모 등을 붙여넣으세요."
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
      />
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        ※ 이 메모는 이번 AI 생성에만 쓰이고 저장되지 않습니다.
      </p>

      <button
        onClick={generate}
        disabled={loading}
        className="mt-3 flex items-center gap-2 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition active:scale-95 disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" strokeWidth={2.5} />
        {loading ? "생성 중…" : "AI 지원 생성"}
      </button>
      {loading && (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          생성 중… 최대 1분 걸릴 수 있어요.
        </p>
      )}

      {notice && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
          {notice}
        </div>
      )}

      {data && (
        <div className="mt-4 space-y-4">
          {/* 가설 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              <Lightbulb className="h-3.5 w-3.5" /> 접근 가설 <span className="text-zinc-600">(관찰 아님)</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">{data.hypothesis || "—"}</p>
          </div>

          {/* observe_targets — ㉮ 루프 닫기 */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
              <Target className="h-3.5 w-3.5" /> 1차에서 관찰해올 것
            </div>
            <ul className="space-y-1.5">
              {(data.observe_targets || []).map((t, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-200">
                  <span className="text-lime-400">·</span> {t}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              → &lsquo;관찰 기록&rsquo; 탭에 이 항목들을 관찰해 입력하면 2차 AI 브리핑의 근거가 됩니다.
            </p>
          </div>

          {/* arc */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              1차 대화 흐름 · arc
            </div>
            <div className="space-y-2">
              {(data.arc || []).map((beat, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                      {beat.when}
                    </span>
                    {beat.tone && (
                      <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">
                        🗣 {beat.tone}
                      </span>
                    )}
                  </div>
                  {beat.intent && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                      <span className="text-zinc-400">왜: </span>
                      {beat.intent}
                    </p>
                  )}
                  {beat.direction && (
                    <p className="mt-1 text-sm leading-relaxed text-zinc-200">{beat.direction}</p>
                  )}
                  {renderExample(beat.example)}
                </div>
              ))}
            </div>
          </div>

          {/* soft_closing */}
          {data.soft_closing && (
            <div className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                <Handshake className="h-3.5 w-3.5" /> 부담 없는 1차 클로징
              </div>
              {data.soft_closing.approach_tag && (
                <span className="inline-block rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                  방향: {labelOf(CLOSING_APPROACH_OPTS, data.soft_closing.approach_tag)}
                </span>
              )}
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                {data.soft_closing.logic || "—"}
              </p>
              {renderExample(data.soft_closing.example)}
            </div>
          )}

          {/* 성장 팁 (data_gaps) — 하단 접힘, 격려 톤 */}
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
            ※ ①은 기본정보 기반 &lsquo;가설&rsquo;이라 저장하지 않습니다(탭 이동 시 사라지고 매번 새로 생성).
          </p>
        </div>
      )}
    </section>
  );
}

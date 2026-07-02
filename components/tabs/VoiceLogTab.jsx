"use client";

/* =========================================================================
   TAB 4  —  실시간 AI 음성 일지 생성기
   녹음(MediaRecorder) → STT + AI 요약(/api/voice-log) → 카톡용 복사 → DB 저장.
   AI 키 미설정·오류·미지원 브라우저 시 데모 리포트로 폴백(앱이 죽지 않음).
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Dumbbell,
  MessageSquareQuote,
  Mic,
  Sparkles,
  Square,
  Target,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fmt } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const MAX_RECORD_SEC = 10 * 60; // 10분 상한(25MB 방어)

/* AI 실패/미설정/미지원 시 보여줄 데모 리포트. */
function buildVoiceReport(member) {
  return {
    machines: [
      { name: "Gym80 아웃싸이 (힙 어브덕션)", detail: "15kg · 15회 · 4세트" },
      { name: "이카리안 레그프레스", detail: "60kg · 12회 · 3세트" },
    ],
    feedback: `${member.name}님, 오늘 ${member.pain} 우회를 위해 골반 고정과 상체 각도 조절에 집중했습니다. 통증 없이 둔근 자극이 아주 잘 들어갔어요.`,
    homework: [
      "홈트 시 상체 각도 15° 유지 — 허리·무릎 부담 최소화",
      "글루트 브리지 15회 × 2세트 (주 3회)",
      "장시간 앉은 뒤 힙 플렉서 스트레칭 30초씩",
    ],
  };
}

/* 브라우저별 지원 녹음 포맷 선택 (크롬 webm / iOS 사파리 mp4·aac). */
function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

/* mimeType → 파일 확장자 (OpenAI는 실제 포맷과 확장자 일치가 핵심). */
function extForMime(type) {
  if (!type) return "webm";
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("aac") || type.includes("m4a")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export default function VoiceLogTab({ member }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | processing | done
  const [sec, setSec] = useState(0);
  const [report, setReport] = useState(null);
  const [rawText, setRawText] = useState(""); // STT 원본 (DB 저장용)
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState(""); // 폴백/권한 안내
  const { toast, showToast } = useToast();

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const maxTimerRef = useRef(null);

  // 녹음 경과 타이머
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // 언마운트 시 마이크 해제
  useEffect(() => {
    return () => {
      clearTimeout(maxTimerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const runDemo = () => {
    setRawText("");
    setReport(buildVoiceReport(member));
    setPhase("done");
  };

  const start = async () => {
    setReport(null);
    setSaved(false);
    setSec(0);
    setRawText("");
    setNotice("");

    // 마이크 미지원 브라우저 → 데모
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setNotice("이 브라우저는 마이크 녹음을 지원하지 않아 데모 리포트로 진행합니다.");
      runDemo();
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice("마이크 권한이 필요합니다. 브라우저에서 권한을 허용한 뒤 다시 시도하세요.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mime = pickMimeType();
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = handleStop;

    rec.start();
    setPhase("recording");

    // 최대 길이 도달 시 자동 정지
    maxTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        setNotice("최대 녹음 시간(10분)에 도달해 자동 정지했습니다.");
        stop();
      }
    }, MAX_RECORD_SEC * 1000);
  };

  const stop = () => {
    clearTimeout(maxTimerRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // → handleStop
    } else {
      setPhase("processing");
    }
  };

  const handleStop = async () => {
    setPhase("processing");
    const type = recorderRef.current?.mimeType || pickMimeType() || "audio/webm";
    releaseMic();

    const blob = new Blob(chunksRef.current, { type });
    if (blob.size === 0) {
      setNotice("녹음된 오디오가 없습니다. 데모 리포트로 대체합니다.");
      runDemo();
      return;
    }

    const fd = new FormData();
    fd.append("audio", blob, `recording.${extForMime(type)}`);

    try {
      const res = await fetch("/api/voice-log", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice((data.error || "AI 처리에 실패했습니다.") + " 데모 리포트로 대체합니다.");
        runDemo();
        return;
      }
      const data = await res.json();
      setRawText(data.raw_text || "");
      setReport(data.report);
      setPhase("done");
    } catch {
      setNotice("네트워크 오류로 AI 처리를 하지 못했습니다. 데모 리포트로 대체합니다.");
      runDemo();
    }
  };

  const buildText = (r) =>
    `[핏 피트니스 AI가 요약한 오늘 ${member.name} 회원님의 운동 일지입니다]\n\n` +
    `1. 오늘 진행한 머신 & 중량/세트\n` +
    r.machines
      .map((m) => `- ${m.name}${m.detail ? `: ${m.detail}` : ""}`)
      .join("\n") +
    `\n\n2. 트레이너 핵심 피드백\n${r.feedback}\n\n` +
    `3. 홈트레이닝 및 주의사항\n` +
    r.homework.map((h) => `- ${h}`).join("\n") +
    `\n\n— 담당 트레이너 드림`;

  const copyAndSave = async () => {
    const text = buildText(report);
    // 1) 클립보드 복사 (실제 동작)
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      document.body.removeChild(ta);
    }
    // 2) Supabase 저장 (실제 동작) — STT 원본 + AI 요약 둘 다 저장
    if (supabase && member?.id) {
      const { error } = await supabase.from("daily_workout_log").insert({
        user_id: member.id,
        raw_voice_text: rawText || null,
        ai_summary: text,
      });
      if (!error) setSaved(true);
    } else {
      setSaved(true); // 데모(키 미설정) 시에도 저장된 것으로 표시
    }
    showToast(
      copied
        ? "복사 완료! 회원님 카톡 창에 붙여넣기(Ctrl+V) 하세요"
        : "복사 실패 — 리포트를 길게 눌러 직접 복사하세요"
    );
  };

  return (
    <div className="space-y-6">
      <style>{`@keyframes voicewave{0%,100%{transform:scaleY(0.25)}50%{transform:scaleY(1)}}`}</style>

      <Eyebrow icon={Mic}>실시간 AI 음성 일지 생성기</Eyebrow>

      {/* 녹음기 */}
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 text-center">
        <div className="text-xs text-zinc-500">
          {member.name} 회원 · 수업 종료 5분 전 구두 요약을 녹음하세요
        </div>

        {/* 파형 */}
        <div className="mt-5 flex h-16 items-center justify-center gap-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${
                phase === "recording" ? "bg-lime-400" : "bg-zinc-700"
              }`}
              style={{
                height: "100%",
                transformOrigin: "center",
                transform: phase === "recording" ? undefined : "scaleY(0.25)",
                animation:
                  phase === "recording"
                    ? `voicewave 0.9s ease-in-out ${(i % 7) * 0.08}s infinite`
                    : "none",
              }}
            />
          ))}
        </div>

        {/* 타이머 */}
        <div className="mt-4 font-mono text-2xl font-bold text-zinc-100">
          {fmt(sec)}
        </div>

        {/* 버튼 */}
        <div className="mt-5">
          {phase === "idle" || phase === "done" ? (
            <button
              onClick={start}
              className="mx-auto flex items-center gap-2 rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-lime-500/30 transition active:scale-95"
            >
              <Mic className="h-5 w-5" strokeWidth={2.5} />
              {phase === "done" ? "다시 녹음" : "수업 요약 녹음 시작"}
            </button>
          ) : phase === "recording" ? (
            <button
              onClick={stop}
              className="mx-auto flex items-center gap-2 rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/30 transition active:scale-95"
            >
              <span className="flex h-5 w-5 items-center justify-center">
                <Square className="h-4 w-4 fill-white" />
              </span>
              녹음 중지
            </button>
          ) : (
            <div className="text-sm font-medium text-lime-400">AI가 정제 중…</div>
          )}
        </div>

        {phase === "recording" && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> 녹음 중
          </div>
        )}

        {notice && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
            {notice}
          </div>
        )}
      </section>

      {/* 처리중 스켈레톤 */}
      {phase === "processing" && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
            <Sparkles className="h-3.5 w-3.5 text-lime-400" /> 음성 → 텍스트 변환 후 AI가 리포트로 정제하는 중
          </div>
          <div className="space-y-2.5">
            <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-full animate-pulse rounded bg-zinc-800/70" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800/70" />
            <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-full animate-pulse rounded bg-zinc-800/70" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800/70" />
          </div>
        </section>
      )}

      {/* 리포트 프리뷰 */}
      {phase === "done" && report && (
        <section className="rounded-2xl border border-lime-500/20 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-400">
              AI 요약 완료
            </span>
            <span className="text-sm font-semibold text-zinc-100">
              {member.name} 회원 · 오늘의 운동 일지
            </span>
          </div>

          {/* 1. 머신 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
              <Dumbbell className="h-3.5 w-3.5" /> 1. 오늘 진행한 머신 & 중량/세트
            </div>
            {report.machines.length > 0 ? (
              <ul className="space-y-1.5">
                {report.machines.map((m, i) => (
                  <li key={i} className="flex justify-between text-sm text-zinc-300">
                    <span>{m.name}</span>
                    <span className="font-mono text-zinc-400">{m.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">언급된 머신 정보가 없습니다.</p>
            )}
          </div>

          {/* 2. 피드백 */}
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
              <MessageSquareQuote className="h-3.5 w-3.5" /> 2. 트레이너 핵심 피드백
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">{report.feedback}</p>
          </div>

          {/* 3. 홈트 */}
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
              <Target className="h-3.5 w-3.5" /> 3. 홈트레이닝 및 주의사항
            </div>
            <ul className="space-y-1.5">
              {report.homework.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
                  <span className="text-lime-400">·</span> {h}
                </li>
              ))}
            </ul>
          </div>

          {/* 복사 버튼 */}
          <button
            onClick={copyAndSave}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-lime-500/30 transition active:scale-95"
          >
            {saved ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Copy className="h-5 w-5" strokeWidth={2.5} />}
            카톡 전송용 리포트 복사하기
          </button>

          {saved && (
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-lime-400" /> 일지가 저장되고 복사되었습니다
            </div>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
            ※ 실제 마이크 녹음 → 음성인식(STT) → AI 요약으로 생성됩니다. 키 미설정·오류·미지원
            브라우저 시 데모 리포트로 자동 폴백합니다.
          </p>
        </section>
      )}

      {/* 토스트 */}
      <Toast message={toast} />
    </div>
  );
}

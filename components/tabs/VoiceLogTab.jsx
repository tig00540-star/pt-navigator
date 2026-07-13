"use client";

/* =========================================================================
   음성일지 서브 입력 (PT 전용) — PTView 공통 저장의 '채우기' 소스.
   녹음(MediaRecorder) → STT + AI 요약(/api/voice-log) → onResult(raw, summary)로 PTView textarea에 채움.
   저장·차감·복사는 PTView saveLog 한 곳(insert 불변식). 키 미설정·오류·미지원 시 데모 리포트 폴백.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import {
  Dumbbell,
  MessageSquareQuote,
  Mic,
  NotebookPen,
  Sparkles,
  Square,
  Target,
} from "lucide-react";
import { fmt } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabaseClient";

const MAX_RECORD_SEC = 10 * 60; // 10분 상한(25MB 방어)

/* AI 실패/미설정/미지원 시 보여줄 데모 리포트. */
function buildVoiceReport(member) {
  return {
    machines: [
      {
        name: "Gym80 아웃싸이 (힙 어브덕션)",
        detail: "15kg · 15회 · 4세트",
        method: [
          "의자 안쪽까지 엉덩이를 밀어넣고 손잡이를 강하게 당겨 가슴을 든 상태로",
          "발바닥 힘보다 무릎에 힘을 실어 양쪽으로 밀어낸다 생각하고",
          "이완은 짧게 수축은 깊게(밀어내는 게 수축)",
          "고관절까지 풀어준다 생각하고 중량을 최대한 올려",
          "20개씩 5세트",
        ],
      },
      {
        name: "이카리안 레그프레스",
        detail: "60kg · 12회 · 3세트",
        method: [
          "발은 어깨너비·발끝 11자",
          "무릎이 발끝 방향 넘어가지 않게",
          "내릴 땐 천천히 2초·밀 땐 힘차게",
          "무릎 끝까지 펴 잠그지 말고 살짝 남기기",
        ],
      },
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

// 오늘 날짜 라벨 (예: 2026.07.26) — 손편지 헤더용.
function todayLabel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// 마무리 배웅 멘트 풀 — 날짜 시드로 하루 안에선 고정(재생성해도 안 바뀜, 랜덤 금지).
const CLOSING_MESSAGES = [
  "오늘도 운동하느라 고생하셨습니다! 행복한 하루 되세요 😊",
  "오늘 수업 정말 잘 따라오셨어요. 푹 쉬시고 내일 또 힘내요!",
  "꾸준함이 몸을 바꿉니다. 오늘도 한 걸음 나아가셨어요!",
  "수고 많으셨어요! 근육은 쉴 때 자랍니다. 잘 회복하세요",
  "오늘도 최선을 다하신 모습 멋졌어요. 좋은 하루 보내세요!",
  "한 세트 한 세트 쌓인 게 결국 결과가 됩니다. 고생하셨어요!",
];
function closingMessage() {
  const key = todayLabel().replace(/\D/g, ""); // "20260726"
  return CLOSING_MESSAGES[Number(key) % CLOSING_MESSAGES.length];
}

export default function VoiceLogTab({ member, onResult }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | processing | done
  const [sec, setSec] = useState(0);
  const [report, setReport] = useState(null);
  const [rawText, setRawText] = useState(""); // STT 원본 (onResult로 PTView에 전달)
  const [notice, setNotice] = useState(""); // 폴백/권한 안내
  const [sessionNo, setSessionNo] = useState(null); // 카톡 헤더 회차(노쇼 포함 누적 · voided 제외)

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

  // 회원별 누적 수업 수 → 다음 회차. 노쇼 포함(voided만 제외) · user_id 전체(재등록 누적).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) { if (!cancelled) setSessionNo(null); return; }
      const { count } = await supabase
        .from("daily_workout_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", member.id)
        .not("voided", "is", true);
      if (!cancelled) setSessionNo((count ?? 0) + 1);
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

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
    fd.append("machines", (member.machines || []).join(", "));

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
    `[${todayLabel()}${sessionNo ? ` · ${sessionNo}회차` : ""}, ${member.name} 회원님 운동일지 입니다!]\n\n` +
    `1. 오늘 진행한 운동\n` +
    r.machines
      .map((m) => {
        const head = `▪ ${m.name}${m.detail ? ` (${m.detail})` : ""}`;
        const cues = (m.method || []).map((c) => `   - ${c}`).join("\n");
        return cues ? `${head}\n${cues}` : head;
      })
      .join("\n\n") +
    `\n\n2. 트레이너 핵심 피드백\n${r.feedback}` +
    (r.homework?.length
      ? `\n\n3. 집에서 참고하세요\n` + r.homework.map((h) => `- ${h}`).join("\n")
      : "") +
    `\n\n${closingMessage()}`;

  return (
    <div className="space-y-6">
      <style>{`@keyframes voicewave{0%,100%{transform:scaleY(0.25)}50%{transform:scaleY(1)}}`}</style>

      <Eyebrow icon={Mic}>실시간 AI 음성 일지 생성기</Eyebrow>

      {/* 녹음기 */}
      <section className="rounded-2xl border border-line bg-card shadow-sm p-6 text-center">
        <div className="text-xs text-muted">
          {member.name} 회원 · 수업 종료 5분 전 구두 요약을 녹음하세요
        </div>

        {/* 파형 */}
        <div className="mt-5 flex h-16 items-center justify-center gap-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${
                phase === "recording" ? "bg-primary" : "bg-line"
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
        <div className="mt-4 font-mono text-2xl font-bold text-ink">
          {fmt(sec)}
        </div>

        {/* 버튼 */}
        <div className="mt-5">
          {phase === "idle" || phase === "done" ? (
            <button
              onClick={start}
              className="mx-auto flex items-center gap-2 rounded-full bg-gradient-to-br from-red-500 to-red-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/30 transition active:scale-95"
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
            <div className="text-sm font-medium text-primary">AI가 정제 중…</div>
          )}
        </div>

        {phase === "recording" && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> 녹음 중
          </div>
        )}

        {notice && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            {notice}
          </div>
        )}
      </section>

      {/* 처리중 스켈레톤 */}
      {phase === "processing" && (
        <section className="rounded-2xl border border-line bg-card shadow-sm p-5">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-primary-strong" /> 음성 → 텍스트 변환 후 AI가 리포트로 정제하는 중
          </div>
          <div className="space-y-2.5">
            <div className="h-4 w-1/3 animate-pulse rounded bg-elevate" />
            <div className="h-3 w-full animate-pulse rounded bg-elevate" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-elevate" />
            <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-elevate" />
            <div className="h-3 w-full animate-pulse rounded bg-elevate" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-elevate" />
          </div>
        </section>
      )}

      {/* 리포트 프리뷰 */}
      {phase === "done" && report && (
        <section className="rounded-2xl border border-primary/30 bg-card shadow-sm p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-strong">
              AI 요약 완료
            </span>
            <span className="text-sm font-semibold text-ink">
              {member.name} 회원 · 오늘의 운동 일지
            </span>
          </div>

          {/* 1. 머신 */}
          <div className="rounded-xl border border-line bg-card shadow-sm p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary-strong">
              <Dumbbell className="h-3.5 w-3.5" /> 1. 오늘 진행한 머신 & 중량/세트
            </div>
            {report.machines.length > 0 ? (
              <ul className="space-y-3">
                {report.machines.map((m, i) => (
                  <li key={i} className="text-sm text-sub">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-ink">{m.name}</span>
                      {m.detail && <span className="font-mono text-sub">{m.detail}</span>}
                    </div>
                    {(m.method || []).length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {m.method.map((c, j) => (
                          <li key={j} className="flex gap-1.5 text-[13px] leading-relaxed text-sub">
                            <span className="text-primary-strong">·</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">언급된 머신 정보가 없습니다.</p>
            )}
          </div>

          {/* 2. 피드백 */}
          <div className="mt-3 rounded-xl border border-line bg-card shadow-sm p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary-strong">
              <MessageSquareQuote className="h-3.5 w-3.5" /> 2. 트레이너 핵심 피드백
            </div>
            <p className="text-sm leading-relaxed text-ink">{report.feedback}</p>
          </div>

          {/* 3. 홈트 */}
          <div className="mt-3 rounded-xl border border-line bg-card shadow-sm p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary-strong">
              <Target className="h-3.5 w-3.5" /> 3. 홈트레이닝 및 주의사항
            </div>
            <ul className="space-y-1.5">
              {report.homework.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-sub">
                  <span className="text-primary-strong">·</span> {h}
                </li>
              ))}
            </ul>
          </div>

          {/* 일지 채우기 — PTView textarea로 전달(저장·차감·복사는 PTView saveLog 한 곳) */}
          <Button variant="primary" size="md" fullWidth onClick={() => onResult?.(rawText, buildText(report))} className="mt-4 gap-2">
            <NotebookPen className="h-5 w-5" strokeWidth={2.5} />
            이 내용으로 일지 채우기
          </Button>

          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            ※ 실제 마이크 녹음 → 음성인식(STT) → AI 요약으로 생성됩니다. 키 미설정·오류·미지원
            브라우저 시 데모 리포트로 자동 폴백합니다.
          </p>
        </section>
      )}
    </div>
  );
}

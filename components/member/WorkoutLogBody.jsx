"use client";

/* 회원이 보는 운동일지 한 건(2026-10-06 · 어르신도 한눈에) — 회원 운동일지 목록 · 확인 창 공용.
   ① 맨 위 한 줄: "4종목 · 12세트"
   ② 종목마다 작은 표(세트 | 무게 | 횟수 · 숫자 크게 · 맨몸은 '맨몸') + '지난번보다 ▲ 20kg'(그 종목 가장 무거운 세트가 늘었을 때만)
   ③ 트레이너 설명 = 저장된 글 그대로 전부(운동 방법 · 피드백 · 주의사항 · 대표 결정: 다 펼침).
   big = '글씨 크게'(회원이 운동일지 탭에서 켬 · 이 기기만). 색 · 크기 클래스는 정적 문자열만. */

const SIZE = {
  normal: { name: "text-[16px]", cell: "text-[16px]", head: "text-[12.5px]", text: "text-[15px]", sum: "text-[13.5px]" },
  big: { name: "text-[19px]", cell: "text-[19px]", head: "text-[14px]", text: "text-[17.5px]", sum: "text-[15px]" },
};

/** sets_structured → [{ name, sets:[{weight, reps}], top }] (무게 · 횟수 둘 다 없는 줄은 뺌) */
export function exercisesOf(log) {
  const list = Array.isArray(log?.sets_structured) ? log.sets_structured : [];
  return list.filter((e) => e && e.exercise).map((e) => {
    const sets = (Array.isArray(e.sets) ? e.sets : []).filter((s) => s && (s.weight != null || s.reps != null));
    const ws = sets.map((s) => Number(s.weight)).filter((w) => Number.isFinite(w) && w > 0);
    return { name: String(e.exercise), sets, top: ws.length ? Math.max(...ws) : null };
  });
}

/** 일지 목록(최신순) → log.id → { 종목명: 지난번보다 늘어난 kg } (늘었을 때만) */
export function gainsByLog(logs) {
  const out = new Map();
  const last = new Map();   // 종목명 → 지난번 가장 무거운 무게
  for (const l of [...(logs || [])].reverse()) {   // 오래된 것부터
    const g = {};
    for (const ex of exercisesOf(l)) {
      if (ex.top == null) continue;
      const prev = last.get(ex.name);
      if (prev != null && ex.top > prev) g[ex.name] = Math.round((ex.top - prev) * 100) / 100;   // 6.25kg 그대로
      last.set(ex.name, ex.top);
    }
    out.set(l.id, g);
  }
  return out;
}

const w = (v) => (v == null || v === "" || Number(v) === 0 ? "맨몸" : `${v} kg`);

export default function WorkoutLogBody({ log, gains = {}, big = false, showText = true }) {
  const z = big ? SIZE.big : SIZE.normal;
  const exs = exercisesOf(log);
  const setCount = exs.reduce((n, e) => n + e.sets.length, 0);
  return (
    <div>
      {exs.length > 0 && (
        <>
          <p className={`m-0 font-semibold text-sub ${z.sum}`}>{exs.length}종목 · {setCount}세트</p>
          <div className="mt-2 space-y-3">
            {exs.map((ex, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center justify-between gap-2 bg-elevate px-3 py-2">
                  <span className={`font-bold text-ink ${z.name}`}>{ex.name}</span>
                  {gains[ex.name] > 0 && <span className={`shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 font-semibold text-cyan-700 ${z.head}`}>지난번보다 ▲ {gains[ex.name]}kg</span>}
                </div>
                {ex.sets.length > 0 && (
                  <table className="w-full border-collapse text-center">
                    <thead>
                      <tr className={`text-muted ${z.head}`}>
                        <th className="w-[28%] py-1 font-semibold">세트</th>
                        <th className="w-[38%] py-1 font-semibold">무게</th>
                        <th className="py-1 font-semibold">횟수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ex.sets.map((s, k) => (
                        <tr key={k} className="border-t border-line">
                          <td className={`py-1.5 font-semibold text-sub ${z.cell}`}>{k + 1}</td>
                          <td className={`py-1.5 font-bold tabular-nums text-ink ${z.cell}`}>{w(s.weight)}</td>
                          <td className={`py-1.5 font-bold tabular-nums text-ink ${z.cell}`}>{s.reps != null && s.reps !== "" ? `${s.reps}회` : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {showText && log?.ai_summary && (
        <div className={exs.length ? "mt-4" : ""}>
          {exs.length > 0 && <p className={`m-0 mb-1 font-bold text-ink ${z.sum}`}>트레이너 설명</p>}
          <p className={`m-0 whitespace-pre-wrap leading-relaxed text-ink ${z.text}`}>{log.ai_summary}</p>
        </div>
      )}
      {!exs.length && !log?.ai_summary && <p className={`m-0 text-muted ${z.text}`}>수업 기록만 있고 내용은 비어 있어요.</p>}
    </div>
  );
}

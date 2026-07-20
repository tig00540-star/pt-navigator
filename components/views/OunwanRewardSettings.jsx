"use client";
/* 오운완 포상 설정 — 누적 N회 달성 시 줄 보상을 트레이너가 정의(자기완결 · TrainerLibrary 패턴).
   trainer_reward CRUD. account_id·trainer_id는 DB DEFAULT라 insert 시 미포함.
   .select() 하드닝 · try/catch/finally · 데모 가드 · Toast · 정적 클래스.

   ※ 여기서 정의한 포상은 회원앱 오운완 카드에 '진행 바'로 보인다(회원 read 정책 = 자기 트레이너 활성분).
     '지급 완료' 마킹은 별개 기능(reward_grant · 후속 S2) — 여기는 정의만 한다. */
import { useEffect, useState } from "react";
import { Trophy, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
import Toast from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

const inputCls =
  "w-full rounded-lg border border-line bg-elevate px-3 py-2.5 text-sm text-ink placeholder-muted outline-none transition focus:border-primary disabled:opacity-50";

export default function OunwanRewardSettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [milestone, setMilestone] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [confirmId, setConfirmId] = useState(null); // 삭제 2단계 확인
  const { toast, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { if (!cancelled) setLoading(false); return; }
      try {
        // RLS(tr_reward_read)가 account+본인 담당으로 이미 좁힌다 → 클라 추가 필터 불필요.
        const { data } = await supabase.from("trainer_reward").select("*").order("milestone", { ascending: true });
        if (cancelled) return;
        setRows(data || []);
      } catch {
        /* 조회 실패 → 빈 목록 유지, 스피너만 해제 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const add = async () => {
    if (saving) return;
    const n = Number(milestone);
    if (!Number.isFinite(n) || n <= 0) return showToast("달성 횟수를 1 이상으로 입력하세요");
    if (!rewardText.trim()) return showToast("포상 내용을 입력하세요");
    const payload = { milestone: n, reward_text: rewardText.trim() };

    setSaving(true);
    if (!supabase) {
      setRows((p) => [...p, { ...payload, id: `demo-${Date.now()}`, active: true }].sort((a, b) => a.milestone - b.milestone));
      setMilestone(""); setRewardText(""); showToast("추가됨(데모)"); setSaving(false); return;
    }
    try {
      const { data, error } = await supabase.from("trainer_reward").insert(payload).select();
      if (error || !data || data.length === 0) { showToast("추가 실패 — 권한/정책 확인"); return; }
      setRows((p) => [...p, data[0]].sort((a, b) => a.milestone - b.milestone));
      setMilestone(""); setRewardText("");
      showToast("추가됨");
    } catch {
      showToast("추가 실패 — 네트워크 확인");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    const next = !r.active;
    if (!supabase) { setRows((p) => p.map((x) => (x.id === r.id ? { ...x, active: next } : x))); return; }
    try {
      const { data, error } = await supabase.from("trainer_reward").update({ active: next }).eq("id", r.id).select();
      if (error || !data || data.length === 0) { showToast("변경 실패 — 정책 확인"); return; }
      setRows((p) => p.map((x) => (x.id === data[0].id ? data[0] : x)));
    } catch {
      showToast("변경 실패 — 네트워크 확인");
    }
  };

  const remove = async (r) => {
    setConfirmId(null);
    if (!supabase) { setRows((p) => p.filter((x) => x.id !== r.id)); return; }
    try {
      const { data, error } = await supabase.from("trainer_reward").delete().eq("id", r.id).select();
      if (error || !data || data.length === 0) { showToast("삭제 실패 — 정책 확인"); return; }
      setRows((p) => p.filter((x) => x.id !== r.id));
      showToast("삭제됨");
    } catch {
      showToast("삭제 실패 — 네트워크 확인");
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={Trophy}>포상 만들기</Eyebrow>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          회원이 오운완을 누적 N회 채우면 줄 보상이에요. 회원앱에 진행 바로 표시됩니다.
        </p>
        <div className="mt-3 space-y-3">
          <label className="block sm:max-w-[12rem]">
            <span className="mb-1 block text-[11px] font-medium text-muted">달성 횟수 *</span>
            <NumberInput
              value={milestone}
              onValueChange={setMilestone}
              disabled={saving}
              placeholder="10"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">포상 내용 *</span>
            <input
              type="text"
              value={rewardText}
              onChange={(e) => setRewardText(e.target.value)}
              disabled={saving}
              placeholder="아메리카노 1잔 · 단백질바 등"
              className={inputCls}
            />
          </label>
          <Button variant="primary" size="md" fullWidth onClick={add} disabled={saving} className="gap-1.5">
            <Plus className="h-4 w-4" /> 포상 추가
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Eyebrow icon={Trophy}>등록한 포상</Eyebrow>
        {loading ? (
          <p className="mt-3 text-sm text-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">아직 없어요. 위에서 첫 포상을 만들어 보세요.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-xl border border-line bg-elevate px-3 py-2.5"
              >
                <span className="shrink-0 rounded-md bg-primary-soft px-2 py-0.5 font-mono text-[11px] font-bold text-primary-strong">
                  {r.milestone}회
                </span>
                <span className={r.active ? "truncate text-sm font-semibold text-ink" : "truncate text-sm font-medium text-muted line-through"}>
                  {r.reward_text}
                </span>
                {/* 활성 토글 — 켜짐/꺼짐 클래스는 완성된 문자열 삼항(동적 조립 금지) */}
                <button
                  onClick={() => toggleActive(r)}
                  className={r.active
                    ? "ml-auto shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-[11px] font-bold text-primary-strong ring-1 ring-primary/30"
                    : "ml-auto shrink-0 rounded-lg bg-card px-2 py-1 text-[11px] font-medium text-muted ring-1 ring-line"}
                >
                  {r.active ? "노출중" : "숨김"}
                </button>
                {confirmId === r.id ? (
                  <button
                    onClick={() => remove(r)}
                    className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-white"
                  >
                    삭제?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmId(r.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-card hover:text-ink"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-muted">
          숨김으로 두면 회원앱에 안 보여요(기록은 남습니다). 지급 여부 기록은 준비 중입니다.
        </p>
      </section>

      <Toast message={toast} />
    </div>
  );
}

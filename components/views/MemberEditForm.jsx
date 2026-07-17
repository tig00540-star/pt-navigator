"use client";
/* 회원 기본정보 수정 — user_table 원본 프리필 + 기본 필드만 UPDATE.
   origin·status·이월계약은 등록 전용이라 제외. 수정 전 경고 모달(자기 진화·정직성). */
import { useEffect, useState } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

const FIELDS = [
  { k: "name", label: "이름", ph: "김철수" },
  { k: "phone_number", label: "휴대폰 번호 (회원앱 로그인용)", ph: "010-1234-5678", type: "tel" },
  { k: "age", label: "나이", ph: "34", type: "number" },
  { k: "job", label: "직업", ph: "IT 개발자" },
  { k: "residence", label: "거주지", ph: "센터 인근 오피스텔" },
  { k: "mbti", label: "MBTI", ph: "ISTJ" },
  { k: "pain", label: "불편 부위", ph: "우측 무릎 통증" },
  { k: "goal", label: "목적", ph: "바디프로필" },
  { k: "goal_deadline", label: "목표 시점·계기", ph: "예: 8월 결혼 / 없으면 비움" },
  { k: "training_pace", label: "원하는 페이스", ph: "가볍게 / 제대로 / 집중해서" },
  { k: "injury_history", label: "부상·수술 이력", ph: "없음 / 2년 전 무릎 수술 등" },
  { k: "exercise_level", label: "운동 경험", ph: "처음 / 가끔 / 꾸준히" },
  { k: "quit_reason", label: "예전 중단 이유", ph: "시간·동기·효과·부상·혼자 막막 등" },
  { k: "past_exercise", label: "받아본 유료 운동", ph: "PT, 필라테스 등 / 없음" },
  { k: "availability", label: "가능 빈도·시간대", ph: "주 2회 · 저녁" },
  { k: "activity_level", label: "하루 활동량", ph: "주로 앉아서 / 활동적" },
  { k: "member_note", label: "바라는 점(선택)", ph: "회원이 미리 남긴 말" },
];

// 표시용 플레이스홀더('-'·'미설정')는 실제 값이 아니라 편집 프리필에서 비운다.
const clean = (v) => (v == null || v === "-" || v === "미설정" ? "" : String(v));

export default function MemberEditForm({ member, onClose, onSaved }) {
  const [ack, setAck] = useState(false); // 경고 확인 → 편집 진입
  const [form, setForm] = useState(null); // null = 로딩 중
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 원본(user_table) 프리필 — 표시용 매핑('-'/'미설정') 대신 실제 값.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !member?.id) {
        const o = {};
        for (const f of FIELDS) o[f.k] = clean(member?.[f.k]);
        if (!cancelled) setForm(o);
        return;
      }
      const { data } = await supabase.from("user_table").select("*").eq("id", member.id).maybeSingle();
      if (cancelled) return;
      const row = data || {};
      const o = {};
      for (const f of FIELDS) o[f.k] = row[f.k] == null ? "" : String(row[f.k]);
      setForm(o);
    })();
    return () => { cancelled = true; };
    // 프리필은 회원(id) 바뀔 때만 재조회 — member 객체 전체 의존 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const setF = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (saving || !form) return;
    if (!form.name.trim()) { setErr("이름은 필수입니다."); return; }
    if (!supabase) { setErr("데모 모드 — 저장할 수 없어요."); return; }
    setSaving(true); setErr("");
    const payload = {};
    for (const f of FIELDS) {
      const v = form[f.k];
      if (f.k === "name") payload.name = v.trim();
      else if (f.k === "age") payload.age = v ? Number(v) : null;
      else if (f.k === "phone_number") payload.phone_number = v.trim() || null;
      else payload[f.k] = (v ?? "").trim() ? v : null;
    }
    // error 없이 0행 = 조용한 실패. .select()로 확정.
    const { data, error } = await supabase.from("user_table").update(payload).eq("id", member.id).select();
    setSaving(false);
    if (error || !data || data.length === 0) { setErr(error ? error.message : "저장 실패 (0행 — 권한/정책 확인)"); return; }
    onSaved();
  };

  return (
    <Modal variant="sheet" onClose={onClose}>
      {!ack ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h2 className="text-base font-semibold text-ink">잠깐 — 정말 사실이 바뀌었나요?</h2>
          </div>
          <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-[13px] leading-relaxed text-ink">
            <p>AI 답을 바꾸려고 회원 정보를 고치는 거라면 멈추세요.</p>
            <p className="text-[15px] font-bold text-rose-700">실패도 경험해야 성장할 수 있습니다. 회피하지 마세요.</p>
            <p className="text-sub">클로징이 안 됐다면 정보를 바꾸지 말고 &lsquo;1차 피드백&rsquo;에 <b>왜 안 됐는지(사유·케이스)</b>를 남기세요 — 그 정직한 기록이 쌓여야 앱이 당신에게 맞는 세일즈 코치로 진화합니다.</p>
            <p className="text-muted">전화번호·직업 변경처럼 <b>실제 사실이 바뀐 경우에만</b> 수정하세요.</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={onClose}>취소</Button>
            <Button variant="primary" size="md" onClick={() => setAck(true)}>사실이 바뀌어서 수정합니다</Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary-strong" />
              <h2 className="text-base font-semibold text-ink">{member.name} 회원 정보 수정</h2>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-elevate hover:text-ink" aria-label="닫기">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!form ? (
            <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.k} className={f.k === "name" ? "col-span-2" : ""}>
                    <label className="mb-1 block text-[11px] font-medium text-muted">
                      {f.label}{f.k === "name" && <span className="text-primary-strong"> *</span>}
                    </label>
                    <input
                      type={f.type || "text"}
                      value={form[f.k]}
                      onChange={setF(f.k)}
                      placeholder={f.ph}
                      className="w-full rounded-lg border border-line bg-elevate px-3 py-2 text-sm text-ink placeholder-muted outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
              {err && <p className="mt-3 text-xs font-medium text-rose-600">{err}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>취소</Button>
                <Button variant="primary" size="md" onClick={save} disabled={saving}>{saving ? "저장 중…" : "수정 저장"}</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

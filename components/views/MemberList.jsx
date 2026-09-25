"use client";

/* =========================================================================
   회원 목록 — 검색 + 세그먼트(전체/OT/PT/보관) + 카드.
   app/page.jsx 안에 있던 MemberListTab을 그대로 옮긴 것(동작 동일).
   허브에서 'OT 회원'·'PT 회원'으로 들어오면 initialSegment로 그 필터가 걸린 채 열린다.
   ========================================================================= */

import { useState } from "react";
import { ChevronRight, Search, User, UserPlus } from "lucide-react";
import { hasVal } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import FilterChip from "@/components/ui/FilterChip";
import { viewFor } from "@/lib/memberStatus";
import MemberBadge, { viewMeta } from "@/components/ui/MemberBadge";

export default function MemberList({ members, selectedId, onSelect, onAdd, uid, initialSegment = "all" }) {
  const [q, setQ] = useState("");
  // 허브에서 'OT 회원'·'PT 회원'으로 들어오면 그 세그먼트로 열린다(하단바 '회원'은 전체).
  const [segment, setSegment] = useState(initialSegment); // all | ot | pt | inactive
  // 원장 = 본인 것 아닌 회원이 보임(RLS상 trainer는 본인 것만 → 토글 불필요).
  const isOwner = members.some((m) => m.trainer_id && uid && m.trainer_id !== uid);
  const [mineOnly, setMineOnly] = useState(true); // 기본 '내 회원'
  const scoped = isOwner && mineOnly ? members.filter((m) => m.trainer_id === uid) : members;

  // 세그먼트 인원수 + 세그먼트 base(all=보관 제외). 검색은 그 위 AND.
  const counts = { ot: 0, pt: 0, inactive: 0 };
  for (const m of scoped) {
    const v = viewFor(m);
    if (v in counts) counts[v] += 1;
  }
  const totalActive = counts.ot + counts.pt; // 전체 = inactive 제외
  const bySegment = scoped.filter((m) => {
    const v = viewFor(m);
    return segment === "all" ? v !== "inactive" : v === segment;
  });
  const list = q.trim()
    ? bySegment.filter((m) =>
        `${m.name} ${m.job}`.toLowerCase().includes(q.trim().toLowerCase())
      )
    : bySegment;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회원 검색 (이름·직업)"
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-ink placeholder-muted shadow-sm outline-none focus:border-primary"
          />
        </div>
        <Button variant="primary" size="md" onClick={onAdd} className="shrink-0">
          <UserPlus className="h-4 w-4" /> 등록
        </Button>
      </div>

      {isOwner && (
        <div className="mb-3 flex gap-1.5">
          {[{ k: true, l: "내 회원" }, { k: false, l: "전체" }].map((t) => (
            <FilterChip
              key={String(t.k)}
              selected={mineOnly === t.k}
              onClick={() => setMineOnly(t.k)}
            >
              {t.l}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-1.5">
        {[
          { key: "all", label: "전체", n: totalActive },
          { key: "ot", label: "OT", n: counts.ot },
          { key: "pt", label: "PT", n: counts.pt },
          { key: "inactive", label: "보관", n: counts.inactive },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSegment(s.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              segment === s.key
                ? "bg-primary-soft text-primary-strong ring-1 ring-primary/30"
                : "bg-elevate text-muted hover:text-ink"
            }`}
          >
            {s.label} {s.n}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center shadow-sm">
          <User className="mx-auto h-8 w-8 text-line" />
          <p className="mt-3 text-sm text-sub">
            {members.length === 0
              ? "아직 등록된 회원이 없어요."
              : q.trim()
              ? "검색 결과가 없어요."
              : "이 그룹에 회원이 없어요."}
          </p>
          {members.length === 0 && (
            <Button variant="ghost" size="sm" onClick={onAdd} className="mt-4">
              첫 회원 등록하기
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => {
            const on = m.id === selectedId;
            const goalSet = hasVal(m.goal) && m.goal !== "미설정";
            return (
              <Card
                as="button"
                key={m.id}
                onClick={() => onSelect(m.id)}
                interactive
                selected={on}
                padding="sm"
                className="group flex items-start gap-3 text-left"
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-sm font-bold ${viewMeta(viewFor(m)).avatar}`}>
                  {m.name ? m.name.slice(0, 1) : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{m.name}</span>
                    <MemberBadge view={viewFor(m)} />
                    {hasVal(m.age) && <span className="font-mono text-xs text-muted">{m.age}세</span>}
                    {on && <Badge tone="primary">선택됨</Badge>}
                  </div>
                  {hasVal(m.job) && <div className="mt-0.5 text-xs text-sub">{m.job}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {hasVal(m.mbti) && <Chip>{m.mbti}</Chip>}
                    {hasVal(m.pain) && <Chip>{m.pain}</Chip>}
                    <Chip muted={!goalSet}>{goalSet ? `목표 ${m.goal}` : "목표 미설정"}</Chip>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted group-hover:text-primary-strong" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

/* =========================================================================
   AppChrome — 모든 트레이너 화면이 공유하는 껍데기(헤더 · 서브탭 · 하단바 · 공용 모달).

   ── 왜 껍데기를 따로 두나 ──
   화면을 주소로 나누면 헤더와 하단바가 화면마다 다시 그려진다. 레이아웃에 한 번만 두면
   화면을 오갈 때 껍데기는 그대로 있고 본문만 바뀐다(앱처럼 보이는 가장 큰 요소).

   ── 이동 방식 ──
   기존 화면들은 onSelect(id, toTab)처럼 '탭 번호'로 이동을 알린다. 그 계약은 그대로 두고
   lib/nav.js에서 번호를 주소로 바꿔 router.push한다 — 덕분에 뒤로가기가 그냥 동작한다.
   ========================================================================= */

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ShieldCheck } from "lucide-react";
import { useAccount } from "@/lib/useAccount";
import { useMembers } from "@/components/app/MembersProvider";
import { hrefFor, routeInfo, tabForPath, OT_STEPS, PT_STEPS } from "@/lib/nav";
import { viewFor } from "@/lib/memberStatus";
import AnnouncementGate from "@/components/AnnouncementGate";
import BottomNav from "@/components/ui/BottomNav";
import BrandMark from "@/components/ui/BrandMark";
import Wordmark from "@/components/ui/Wordmark";
import MemberForm from "@/components/MemberForm";
import MemberEditForm from "@/components/views/MemberEditForm";
import { SETTINGS_SUBTABS } from "@/components/views/SettingsView";

/* 회원 워크플로우 탭 그룹 색(purge-safe · 정적) — OT=amber, PT=sky */
const GROUP_TAB = {
  ot: { active: "text-amber-600", idle: "text-amber-700/60 hover:text-amber-700", bar: "bg-amber-500" },
  pt: { active: "text-sky-600",   idle: "text-sky-700/60 hover:text-sky-700",     bar: "bg-sky-500" },
  settings: { active: "text-primary-strong", idle: "text-primary-strong/60 hover:text-primary-strong", bar: "bg-primary" },
};

/* 화면에서 공용 모달을 여는 통로 — 신규 등록 버튼이 여러 화면에 있어서 한 곳에 둔다. */
const UiCtx = createContext({ openMemberForm: () => {}, openMemberEdit: () => {} });
export const useAppUi = () => useContext(UiCtx);

// 탭 번호 → 주소 이동. 회원 워크플로우 탭이면 그 회원 주소로.
export function useGoTab() {
  const router = useRouter();
  return useMemo(() => (tab, memberId) => router.push(hrefFor(tab, memberId)), [router]);
}

function SubTabs({ items, activeHref, tone }) {
  const g = GROUP_TAB[tone];
  return (
    <nav className="-mb-px flex items-stretch gap-1 overflow-x-auto whitespace-nowrap">
      {items.map((t) => {
        const on = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${on ? g.active : g.idle}`}
          >
            {t.label}
            {on && <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${g.bar}`} />}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppChrome({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { members, myUid, dbNote, loadMembers } = useMembers();
  const { isCenter, isOwner, trainerName } = useAccount();
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);

  const info = routeInfo(pathname);
  const member = info.memberId ? members.find((m) => m.id === info.memberId) || null : null;
  const editing = editId ? members.find((m) => m.id === editId) || null : null;

  const ui = useMemo(() => ({
    openMemberForm: () => setShowForm(true),
    openMemberEdit: (id) => setEditId(id),
  }), []);

  // 회원 워크플로우 서브탭 — 그 회원의 뷰(OT/PT)에 맞는 것만.
  const view = member ? viewFor(member) : null;
  const steps =
    info.section === "ot" && view !== "pt" ? OT_STEPS.map((s) => ({ ...s, href: `/ot/${info.memberId}/${s.step}` }))
    : info.section === "pt" && view === "pt" ? PT_STEPS.map((s) => ({ ...s, href: `/pt/${info.memberId}/${s.step}` }))
    : null;

  return (
    <UiCtx.Provider value={ui}>
    <div className="min-h-screen bg-bg pb-28 text-ink antialiased selection:bg-primary/20">
      {/* 공지 — 게이트(필수확인 강제) + 재열람(벨). gateList 0·!supabase·uid null이면 오버레이 없음. */}
      <AnnouncementGate
        uid={myUid}
        onUnreadCount={setUnreadCount}
        reviewOpen={bellOpen}
        onReviewClose={() => setBellOpen(false)}
      />

      <header className="sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            {/* 로고 락업 = 홈(허브)으로. 어느 화면에서든 한 번에 첫 화면으로 돌아온다. */}
            <Link href="/" aria-label="홈으로" className="flex min-w-0 shrink-0 items-center gap-2.5 transition active:scale-95">
              <BrandMark accent="trainer" title="오직 트레이너" className="h-9 w-9 shrink-0 rounded-lg" />
              <span className="min-w-0">
                <Wordmark className="block text-[17px] font-extrabold leading-none tracking-[-0.04em]" />
                <span className="mt-1 block max-w-[140px] truncate text-[12px] font-medium leading-none text-muted sm:max-w-none">
                  {trainerName || "트레이너"}
                </span>
              </span>
            </Link>

            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setBellOpen(true)}
                className="relative flex items-center gap-1.5 rounded-lg border border-line bg-elevate px-2.5 py-1.5 text-xs font-medium text-sub transition hover:border-primary hover:text-primary-strong active:scale-95"
                aria-label="공지"
              >
                <Bell className="h-3.5 w-3.5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isCenter && isOwner && (
                <a
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-700 transition hover:border-fuchsia-500/60 active:scale-95"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">관리자</span>
                </a>
              )}
            </div>
          </div>

          {steps && <SubTabs items={steps} activeHref={pathname} tone={info.section} />}
          {info.section === "settings" && (
            <SubTabs
              items={SETTINGS_SUBTABS.map((t) => ({ label: t.label, href: `/settings/${t.id}` }))}
              activeHref={`/settings/${info.sub || "me"}`}
              tone="settings"
            />
          )}
        </div>
      </header>

      {dbNote && (
        <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
          <div className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-sub shadow-sm">
            {dbNote}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* key=주소 — 화면이 바뀔 때마다 진입 모션을 다시 재생한다(기존 .tab-anim 그대로). */}
        <div key={pathname} className="tab-anim">{children}</div>
      </main>

      {showForm && (
        <MemberForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadMembers(); }}
        />
      )}
      {editing && (
        <MemberEditForm
          member={editing}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); loadMembers(); }}
        />
      )}

      <BottomNav tab={tabForPath(pathname)} onTab={(tab) => router.push(hrefFor(tab, info.memberId))} />
    </div>
    </UiCtx.Provider>
  );
}

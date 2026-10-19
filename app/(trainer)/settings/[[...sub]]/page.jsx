/* 설정 — /settings(내 정보) · /settings/money · /settings/gear · /settings/library · /settings/reward · /settings/notify · /settings/billing(구독 관리) */

import SettingsScreen from "@/components/screens/SettingsScreen";

export default async function SettingsPage({ params }) {
  const { sub } = await params;
  const first = Array.isArray(sub) ? sub[0] : sub;
  return <SettingsScreen sub={first || "me"} />;
}

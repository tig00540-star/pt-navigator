"use client";

import SettingsView from "@/components/views/SettingsView";
import { useAccount } from "@/lib/useAccount";

export default function SettingsScreen({ sub = "me" }) {
  const { isSolo, isFreelance, isOwner } = useAccount();
  return <SettingsView isSolo={isSolo} isFreelance={isFreelance} isOwner={isOwner} sub={sub} />;
}

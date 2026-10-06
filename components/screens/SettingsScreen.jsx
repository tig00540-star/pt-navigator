"use client";

import SettingsView from "@/components/views/SettingsView";
import { useAccount } from "@/lib/useAccount";

export default function SettingsScreen({ sub = "me" }) {
  const { isSolo, isFreelance } = useAccount();
  return <SettingsView isSolo={isSolo} isFreelance={isFreelance} sub={sub} />;
}

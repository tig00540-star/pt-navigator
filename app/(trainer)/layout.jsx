"use client";

/* 트레이너 앱 공통 레이아웃 — 회원 데이터(한 번만 로드) + 껍데기(헤더·하단바·모달).
   이 그룹 안의 화면들은 본문만 갈아끼워진다. 그룹 이름 (trainer)는 주소에 안 들어간다. */

import MembersProvider from "@/components/app/MembersProvider";
import AppChrome from "@/components/app/AppChrome";

export default function TrainerLayout({ children }) {
  return (
    <MembersProvider>
      <AppChrome>{children}</AppChrome>
    </MembersProvider>
  );
}

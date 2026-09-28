/* 화면 이동 중 자리 — Next가 다음 화면을 준비하는 동안 이 틀을 보여준다.
   껍데기(헤더·하단바)는 레이아웃에 있어 그대로 남고, 본문 자리만 바뀐다. */

import SkeletonScreen from "@/components/ui/Skeleton";

export default function Loading() {
  return <SkeletonScreen cards={3} />;
}

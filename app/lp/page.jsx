"use client";

/* =========================================================================
   「오직 트레이너」 트레이너용 랜딩 (/lp · 로그인 안 한 방문자의 "/") — v5 (2026-10-02)
   -------------------------------------------------------------------------
   기준: Claude Design 시안(docs/design/landing) = 기획안 v5(docs/lp-claude-design-기획안.md) §5.
   - 레퍼런스 aurafit.co.kr의 구성만(좁은 한 열·배지·화면 주인별 묶음·라벨 알약·하루 금액).
     경쟁사라 색·문장·숫자는 가져오지 않는다.
   - 순서(2026-10-06 대표): 첫 화면 → 왜 → 다른 점 4가지(결과 장면) → 앱 기능 5묶음(일하는 순서 · 과정 장면) → 체험 → 가격.
   - 화면 = 데모 계정(가짜 회원)에서 찍은 실제 앱 캡처(public/lp/shots · 4:5) 또는
     실제 화면 데모(public/lp/demos · DemoSlot). 목업 그리지 않음.
   - 후기 구간은 실제 후기(허락받은 것) 3개가 모이기 전까지 렌더하지 않는다(REVIEWS 비어 있음).
   - 가격은 lib/plans.js에서 직접 읽는다(랜딩↔결제 불일치 금지).
   - 효과 문구는 실제 동작하는 기능만.
   ========================================================================= */

import { useRef } from "react";
import InstallAppButton from "@/components/InstallAppButton";
import { contactHref } from "@/lib/company";
import { PLANS } from "@/lib/plans";
import { wonApprox } from "@/lib/format";
import {
  H2, H2_MD, H2_LG, BTN_PRIMARY, BTN_OUTLINE, BTN_WHITE, Header, Footer, useReveal, stagger,
  Pill, Checks, GroupLabel, StepShots, BeforeAfter, Faq, Arrow, LP_CSS, Visual, TryLink, Bundle, H3, FeatureGallery,
} from "./parts";

/* ───────── 데이터 ───────── */

// 기능 사실만(실적 숫자 아님). "0건"은 약속처럼 읽혀 뺐다.
const FACTS = [
  { n: "30초", t: "말로 남기는\n운동일지" },
  { n: "3분", t: "수업 직전\nOT 준비" },
  { n: "5가지", t: "미리 준비하는\n거절 대응" },
];

// 실제 후기(이름·지역/센터·한 줄) — 허락받은 것만. 3개 모이기 전까지 구간 자체를 숨긴다.
const REVIEWS = [];

const WHY = [
  ["일지·기록에 매일 40분", "말로 30초"],
  ["OT 준비는 매번 백지에서", "AI가 대사·근거까지"],
  ["재등록은 기억력에 의존", "앱이 먼저 알림"],
  ["회원이 늘수록 관리도 두 배", "회원이 셀프로 관리"],
];

// 오직 트레이너가 다른 점 4가지(2026-10-06 대표) — 기능 설명 전에 먼저. 사진은 '결과 장면', 아래 묶음은 '과정 장면'.
//   '우리만'이라고 쓰지 않는다(경쟁사 확인 전). 문구는 실제 동작만.
const SPECIAL = [
  {
    n: "01", pill: "사전 준비 리포트",
    title: ["세일즈 몰라도,", "읽고 들어가면 됩니다."],
    desc: "회원 정보로 오늘 할 말을 대사로 만들어요. 30초 요약 · 클로징 멘트 · 거절 대응 5가지까지, 수업 들어가기 전 3분이면 충분해요.",
    visual: { img: "/lp/shots/2026-10/T09.webp", alt: "OT 사전 준비 리포트의 클로징: 왜 PT가 필요한지 · 확인 질문 · 추천 플랜 대사와 가격 한 줄" },
  },
  {
    n: "02", pill: "기록으로 만드는 세일즈북",
    title: ["재등록은 말이 아니라,", "기록으로."],
    desc: "그동안 쌓인 운동일지 · 인바디가 그대로 재등록 세일즈북의 '변화' 장이 돼요. 변화 표의 숫자는 기록에서 그대로 가져와요.",
    steps: [
      { step: "쌓인 기록", img: "/lp/shots/2026-10/R01.webp", alt: "PT 회원 대시보드: 이번 계약 14/20회와 처음보다 달라진 것(체중 · 골격근량 · 체지방률 · 레그프레스)" },
      { step: "세일즈북 '변화' 장", img: "/lp/shots/2026-10/R03p.webp", alt: "재등록 세일즈북의 숫자로 확인된 변화: 인바디와 대표 종목 무게의 처음 · 지금 · 변화" },
    ],
  },
  {
    n: "03", pill: "말로 쓰는 운동일지",
    title: ["쓰지 말고 말하세요.", "서명까지 받아요."],
    desc: "수업 끝나고 30초 말하면 운동 · 무게 · 세트로 정리돼요. 회원은 폰에서 확인하고 손가락으로 서명하고, 한 달 수업은 수업 확인서 한 장으로 남아요.",
    stepsKey: "log",
    href: "/try#sign",
  },
  {
    n: "04", pill: "회원 전용 페이지",
    title: ["설치 없이 링크 하나,", "회원이 스스로 챙겨요."],
    desc: "운동일지 · 몸의 변화 · 개인운동 루틴 · 수업 예약 요청 · 이벤트까지, 회원이 링크 하나로 직접 봐요.",
    visual: { img: "/lp/shots/2026-10/M02.webp", alt: "회원 전용 페이지 홈: 참여 중인 이벤트와 내 PT(남은 수업 · 수업 일정)" },
  },
];

const TRY_LINKS = [["/try#qr", "QR로 OT 신청"], ["/try#event", "회원 이벤트"], ["/try#booking", "수업 예약 요청"], ["/try#sign", "운동일지 · 서명"]];

// 데모 계정 최준호 수업 — ① 대표가 실제로 녹음한 문장(앞부분 그대로 · 칸에 맞춰 뒤는 …) ② 그 녹음을 AI가 정리한 실제 결과 ③ 한 달 수업 확인서.
const LOG_STEPS = [
  {
    step: "말로 30초",
    quote: "오늘 최준호 회원님 하체 했어요. 스쿼트 60킬로 10개씩 2세트, 70킬로 10개씩 2세트, 80킬로 10개씩 2세트 총 6세트 진행했고 다음으로 루마니안 데드리프트 40키로로 시작해서 10kg씩 올려서 12개 1세트로 총 3세트, 마지막으로 레그프레스 120킬로 고정으로 15개 3세트 했어요. …",
  },
  { step: "일지 · 서명", img: "/lp/shots/2026-10/T18.webp", alt: "지난 수업 목록: 음성으로 쓴 운동일지와 회원이 손가락으로 한 서명" },
  { step: "수업 확인서", img: "/lp/shots/2026-10/T19.webp", alt: "한 달 수업을 회원 서명과 함께 모은 수업 확인서" },
];

// 앱 기능 — 일하는 순서대로 5묶음(2026-10-06). 사진 = 데모 센터(지어낸 회원)의 실제 앱 화면.
const BUNDLES = [
  {
    id: "b-ot", nav: "신규 OT",
    pill: "신규 OT 진행",
    title: ["신청부터 등록까지,", "한 흐름으로."],
    checks: ["회원권 등록하는 자리에서 QR로 OT 신청 · 원하는 시간 · 목표 · 몸 상태를 미리", "수업 직전 3분 사전 준비 리포트 · 오늘 운동 4개", "끝나면 탭 몇 번으로 피드백, 다음 OT 준비로 이어져요"],
    note: "센터 QR로 받으면 대표가 트레이너를 정해 넘겨줘요",
    hero: { img: "/lp/shots/2026-10/T07.webp", alt: "OT 사전 준비 리포트 맨 위 30초 요약: 이 회원 · 오늘 꼭 · 요청 한 줄씩" },
    items: [
      { name: "QR 신청서", desc: "회원이 원하는 요일 · 시간을 직접", img: "/lp/shots/2026-10/T02.webp", alt: "회원이 보는 OT 신청서: 원하는 요일 · 시간 고르기" },
      { name: "새 OT 회원", desc: "신청하면 바로 내 폰에", img: "/lp/shots/2026-10/T04.webp", alt: "트레이너 홈의 새 OT 회원 카드: 내 QR로 신청 · 원하는 시간" },
      { name: "미리 알고 준비", desc: "목표 · 주 몇 번 · 아직 모르는 것까지", img: "/lp/shots/2026-10/T06.webp", alt: "OT 회원 대시보드: 목표 · 운동 가능 횟수 · 알게 된 경로 · 원하는 시간 · 아직 모르는 것" },
      { name: "오늘 운동 4개", desc: "몸 상태 → 메인 동작 → 목표 부위 → 처음과 비교", img: "/lp/shots/2026-10/T08.webp", alt: "1차 OT 사전 준비 리포트의 오늘 운동 4칸과 할 말" },
      { name: "거절 대응 5가지", desc: "생각해볼게요 · 가격 · 효과 의심 · 시간 · 비교", img: "/lp/shots/2026-10/T10.webp", alt: "OT 사전 준비 리포트의 거절 대응 5가지" },
      { name: "OT 피드백은 탭으로", desc: "어떻게 끝났는지만 누르면 다음 OT가 열려요", img: "/lp/shots/2026-10/T13.webp", alt: "OT 피드백: 등록했어요 · 다음 OT 이어가요 · 그만하기로 했어요" },
    ],
    href: "/try#qr",
  },
  {
    id: "b-renew", nav: "재등록",
    pill: "재등록 진행",
    title: ["재등록 시기,", "앱이 먼저 알려줘요."],
    checks: ["잔여가 줄어든 회원을 '오늘 할 일'에 먼저", "인바디 · 운동일지로 그동안의 변화 정리", "재등록 제안 멘트와 세일즈북까지 준비"],
    note: "잔여 10회 미만부터 알려줘요",
    hero: { img: "/lp/shots/2026-10/T15.webp", alt: "재등록 사전 준비 리포트의 30초 요약" },
    items: [
      { name: "재등록 타이밍", desc: "잔여 10회 미만 회원을 먼저", img: "/lp/shots/2026-10/T14.webp", alt: "오늘 탭의 재등록 타이밍 카드: 잔여 10회 미만 회원 목록" },
      { name: "그동안의 여정", desc: "함께한 기간 · 완료 수업 · 주 평균", img: "/lp/shots/2026-10/R02.webp", alt: "재등록 세일즈북의 그동안의 여정: 1개월 · 14회 · 주 2.2회 · 남은 6회", wide: true },
      { name: "지금 어디까지 · 앞으로", desc: "지금 단계와 다음 단계", img: "/lp/shots/2026-10/R04.webp", alt: "재등록 세일즈북의 지금 어디까지 · 앞으로: 단계별 로드맵", wide: true },
    ],
  },
  {
    id: "b-book", nav: "세일즈북",
    pill: "세일즈북",
    title: ["클로징 직전 2분,", "폰을 돌려 보여 주세요."],
    checks: ["1차 OT는 오늘 해 본 운동으로, 재등록은 그동안의 기록으로", "목표 · 로드맵 · 추천 플랜 · 약속까지 한 장씩", "PT 가격표는 설정한 패키지 그대로, 어느 장에서든"],
    note: "같은 목적의 다른 회원 변화 사례도 넣을 수 있어요(사례 보관함)",
    hero: { img: "/lp/shots/2026-10/S03.webp", alt: "세일즈북 발표 화면(가로): 오늘 함께 확인한 것 · 제가 본 원인 · 바꿔 드릴 방향", wide: true },
    items: [
      { name: "여기까지 함께 갑니다", desc: "지금 단계부터 목표까지 6단계", img: "/lp/shots/2026-10/S05.webp", alt: "세일즈북 로드맵 장: 지금 여기 1단계부터 6단계 목표까지", wide: true },
      { name: "추천 플랜", desc: "회원에게 맞춘 코스와 이유", img: "/lp/shots/2026-10/S06.webp", alt: "세일즈북 추천 플랜 장: 추천 코스와 다른 코스, 회당 가격", wide: true },
      { name: "마지막 장, 약속", desc: "등록 권유 대신 끝까지 함께하겠다는 약속", img: "/lp/shots/2026-10/S07.webp", alt: "세일즈북 마지막 장: 트레이너가 지키는 것들과 손글씨 약속", wide: true },
      { name: "PT 가격표", desc: "설정한 패키지를 그대로 · 회당 가격까지", img: "/lp/shots/2026-10/T12.webp", alt: "PT 가격표: 패키지별 회차 · 기간 · 가격 · 회당 가격" },
    ],
  },
  {
    id: "b-pt", nav: "PT 회원 관리",
    pill: "PT 회원 관리",
    title: ["수업 밖 관리,", "앱이 먼저 챙겨요."],
    checks: ["수업 예약 · 변경 · 취소 요청을 승인 한 번으로", "재등록 타이밍 · 운동일지 미확인 · 인바디 잴 회원을 먼저 알려줘요", "개인운동 루틴 · 회원 이벤트 · 오운완 랭킹"],
    note: "회원이 '내용이 달라요'를 누르면 바로 보여요",
    hero: { img: "/lp/shots/2026-10/T21.webp", alt: "트레이너 홈의 수업 요청 카드: 회원이 보낸 취소 · 시간 변경 · 새 수업 요청과 승인 · 거절 버튼" },
    items: [
      { name: "스케줄", desc: "주간 표 · 개인 일정 · 회원 요청까지", img: "/lp/shots/2026-10/T20.webp", alt: "트레이너 주간 스케줄" },
      { name: "개인운동 루틴", desc: "PT 기록으로 만드는 혼자 오는 날 루틴", img: "/lp/shots/2026-10/T23.webp", alt: "회원 개인운동 루틴 카드" },
      { name: "회원 이벤트", desc: "출석 챌린지 · 참여 명단 · 상품 지급", img: "/lp/shots/2026-10/T22.webp", alt: "트레이너 설정의 이벤트 관리: 출석 챌린지 참여 명단과 달성 여부" },
      { name: "오운완 랭킹", desc: "이번 달 운동한 날로 내 회원 순위", img: "/lp/shots/2026-10/T24.webp", alt: "트레이너 홈의 오운완 랭킹" },
      { name: "'내용이 달라요'", desc: "회원이 고쳐 달라고 하면 바로", img: "/lp/shots/2026-10/T25.webp", alt: "회원이 '내용이 달라요'를 누른 운동일지와 회원 메모" },
    ],
    href: "/try#booking",
  },
  {
    id: "b-member", nav: "회원 전용 페이지",
    pill: "회원 전용 페이지",
    title: ["붙잡지 마세요.", "회원이 스스로 챙깁니다."],
    checks: ["설치 없이 링크로 여는 회원 전용 페이지", "운동일지 · 인바디 · 무게 변화를 회원이 직접", "오운완 · 이벤트 참여 · 수업 예약 요청까지"],
    note: "링크와 휴대폰 뒤 4자리로 열려요",
    items: [
      { name: "내 PT", desc: "남은 수업 · 다음 수업 · 시간 바꾸기 · 취소", img: "/lp/shots/2026-10/M01.webp", alt: "회원 전용 페이지 내 PT: 남은 수업 12회 / 32회 · 수업 일정 · 시간 바꾸기 · 취소하기 · 새 수업 요청하기" },
      { name: "새 수업 요청", desc: "트레이너 빈 시간만 골라 요청", img: "/lp/shots/2026-10/M06.webp", alt: "새 수업 요청: 이번 주 · 다음 주 날짜와 시간 고르기(트레이너 일정 있는 칸은 흐리게)" },
      { name: "운동일지", desc: "세트 · 무게 · 횟수 표와 '지난번보다 ▲'", img: "/lp/shots/2026-10/M08.webp", alt: "회원 운동일지: 종목별 세트 · 무게 · 횟수 표와 지난번보다 늘어난 무게" },
      { name: "운동 달력", desc: "PT · 개인운동 · 유산소를 한 달에", img: "/lp/shots/2026-10/M07.webp", alt: "회원 운동 달력: PT · 개인운동 · 유산소를 색 점으로" },
      { name: "인바디 변화", desc: "체중 · 골격근량 · 체지방을 직전과 비교", img: "/lp/shots/2026-10/M09.webp", alt: "회원 인바디 변화: 체중 · 골격근량 · 체지방량 · 체지방률 · 기초대사량 · 내장지방" },
      { name: "무게 변화", desc: "종목별로 얼마나 늘었는지", img: "/lp/shots/2026-10/M10.webp", alt: "회원 종목별 무게 변화 그래프" },
      { name: "개인운동 루틴", desc: "혼자 오는 날 할 것과 트레이너 한마디", img: "/lp/shots/2026-10/M11.webp", alt: "회원 개인운동 루틴: 오늘 할 부위 · 트레이너 한마디 · 세트별 무게와 횟수" },
      { name: "목표 로드맵", desc: "지금 몇 단계인지, 앞으로 남은 것", img: "/lp/shots/2026-10/M04.webp", alt: "회원 목표 로드맵: 지나온 단계와 지금 단계, 남은 단계" },
      { name: "이벤트 참여", desc: "출석 챌린지 진행과 상품", img: "/lp/shots/2026-10/M05.webp", alt: "회원 이벤트 자세히: 10월 출석 챌린지 기간 · 상품 · 진행 5/12회" },
      { name: "오운완", desc: "운동한 날 · 연속 · 배지", img: "/lp/shots/2026-10/M03.webp", alt: "회원 오운완 카드: 이번 달 · 누적 · 연속과 배지" },
    ],
  },
];

// 회원 전용 페이지에 실제로 뜨는 문구 — 후기가 아니라 제품 화면이다(실제 폰 알림 사진이 오면 바꾼다).
const MEMBER_NOTICES = ["오늘 운동일지가 도착했어요", "이번 달 출석 8회, 오운완 챌린지 진행 중"];

// 태블릿 · PC 버전 — 같은 계정이 넓은 배치로(2026-10-06 · 데모 센터 실제 화면 · 넓은 홈은 1024px부터)
const WIDE = [
  { device: "pc", name: "회원 관리", desc: "목록 · 대시보드 · 지난 수업을 한 화면에", img: "/lp/shots/2026-10/W02.webp", alt: "PC 회원 화면: 왼쪽 회원 목록, 가운데 PT 대시보드, 오른쪽 지난 수업" },
  { device: "pc", name: "OT 사전 준비 리포트", desc: "회원 목록 옆에 리포트를 펼쳐 놓고", img: "/lp/shots/2026-10/W03.webp", alt: "PC OT 사전 준비 리포트: 30초 요약 · 입장 첫마디 · 오늘 운동 4개" },
  { device: "pc", name: "넓은 홈", desc: "오늘 일정 · 챙길 회원 · 회원 쪽 소식", img: "/lp/shots/2026-10/P01.webp", alt: "PC 넓은 홈: 오늘 수업 · 오늘 일정 · 챙길 회원 · 회원 쪽 소식 · 오운완 랭킹" },
  { device: "pc", name: "내 실적", desc: "성적표 · 예상 급여 · 매출 · 등록률", img: "/lp/shots/2026-10/W06.webp", alt: "PC 내 실적: 지난달 성적표 · 이달 예상 급여 · 이달 매출과 목표 · 등록률 · 수업 수" },
  { device: "tablet", name: "주간 스케줄", desc: "스케줄과 오늘 할 일을 나란히", img: "/lp/shots/2026-10/P02.webp", alt: "태블릿 주간 스케줄과 오늘 할 일(이탈 위험 · 새 OT 회원 · 수업 요청)" },
  { device: "tablet", name: "재등록 리포트", desc: "회원 목록 옆에 30초 요약과 대사", img: "/lp/shots/2026-10/W04.webp", alt: "태블릿 재등록 사전 준비 리포트: 30초 요약과 수업 순서별 대사" },
  { device: "tablet", name: "세일즈북 발표", desc: "회원 앞에 태블릿을 놓고 한 장씩", img: "/lp/shots/2026-10/W05.webp", alt: "태블릿 세일즈북 발표: 숫자로 확인된 변화 장" },
];

// 사진 없이 이름만 — 묶음 아래 한 줄
const MORE = ["월간 성적표", "인바디 분석", "사례 보관함", "폰 알림", "급여 자동계산", "프리랜서 장부"];

const TIERS = [
  {
    key: "solo",
    tagline: "개인 트레이너 1인",
    feats: ["1·2차 OT · 재등록 서포트 · 세일즈북", "QR OT 신청서 · 수업 예약 요청 · 회원 이벤트", "음성 운동일지 · 회원 확인 서명", "회원 전용 페이지 · 월간 결산 · 급여/장부"],
    highlight: true,
    cta: { label: "7일 무료 체험", href: "/signup" },
  },
  {
    key: "center",
    tagline: "트레이너 3인 + 대표 1인",
    feats: ["솔로 전체 포함", "대표 대시보드 (매출·정산·등록·이탈)", "트레이너 3인 좌석 + 대표 1인", "트레이너 코칭 · 팀 관리"],
    highlight: false,
    cta: { label: "센터 자세히 보기", href: "/center" },
  },
];

const FAQ = [
  { q: "설치해야 하나요?", a: "아니요. 브라우저로 바로 쓰고, 홈 화면에 추가하면 앱처럼 열립니다." },
  { q: "어떤 기기에서 되나요?", a: "폰에 맞춰 만들었고, 태블릿 · PC에서는 넓은 화면에 맞춘 배치로 열려요. 같은 계정이라 어디서 열어도 기록이 그대로예요." },
  { q: "AI가 대신 팔아주나요?", a: "아니요. 관찰은 트레이너가, 근거 정리는 AI가 맡습니다." },
  { q: "회원 정보는 안전한가요?", a: "계정별로 데이터가 분리되고, 회원은 본인 것만 봅니다." },
  { q: "센터에 소속돼 있는데 혼자 써도 되나요?", a: "네. 개인 트레이너로 가입하고 '센터 소속'을 고르면 돼요. 회원 페이지와 OT 신청서엔 '○○짐 · 내 이름 트레이너'로 나와요." },
  { q: "프리랜서도 되나요?", a: "네. '프리랜서'를 고르면 PT 매출 · 그 밖의 매출 · 지출 · 남은 돈을 장부로 함께 봐요. 센터와 매출을 나누면 그 방식도 정할 수 있어요." },
  { q: "가입 전에 써 볼 수 있나요?", a: "네. '직접 눌러 보기'에서 트레이너 폰과 회원 폰을 나란히 두고 QR 신청 · 이벤트 · 수업 요청 · 서명을 해 볼 수 있어요." },
  { q: "의료·재활 목적인가요?", a: "아니요. 운동 지도·세일즈·회원관리 도구입니다." },
];

const perDay = (amount) => `하루 약 ${wonApprox(amount / 30)}`;

/* ───────── 페이지 ───────── */

export default function LandingPage() {
  const rootRef = useRef(null);
  useReveal(rootRef);
  const solo = PLANS.solo;

  return (
    <div ref={rootRef} className="min-h-dvh bg-card text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS}</style>
      <Header
        page="trainer"
        nav={[["#special", "다른 점"], ["#features", "기능"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]]}
        cta={{ label: "무료로 시작", href: "/signup" }}
      />

      <main>
        {/* ② 첫 화면 — 효과 없음 */}
        <section className="bg-card px-5 pb-[clamp(56px,10vw,112px)] pt-[clamp(48px,9vw,112px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <span className="inline-flex min-h-[34px] items-center rounded-full border border-primary/15 bg-primary-soft px-4 text-[14px] font-bold text-primary-strong">
              트레이너가 직접 만든 PT 세일즈·회원관리 앱
            </span>
            <h1 className="m-0 text-[clamp(36px,8vw,60px)] font-black leading-[1.16] tracking-[-0.045em]">
              <span className="block">OT는 등록으로,</span>
              <span className="block text-primary">수업 밖 일은 앱으로.</span>
            </h1>
            <p className="m-0 max-w-[540px] text-[clamp(17px,2.6vw,20px)] leading-[1.6] text-sub">
              1차 OT 준비부터 클로징 멘트·운동일지·재등록까지, 트레이너의 수업 밖 업무를 앱이 맡습니다.
            </p>
            <div className="mt-1.5 flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
              <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <Arrow /></a>
              {/* InstallAppButton은 자체 클래스(레드 채움)를 갖고 있어 겹치는 속성은 !로 덮는다. */}
              <InstallAppButton
                className="!min-h-[52px] justify-center !rounded-xl !border !border-line-strong !bg-card !px-6 !py-0 !text-[17px] !text-ink hover:!bg-elevate"
                label="앱처럼 설치"
              />
            </div>
            <p className="m-0 text-[14px] text-sub">설치 없이 폰에서 바로 · 7일 무료 체험 · <a href="/try" className="font-bold text-primary-strong underline-offset-2 hover:underline">가입 없이 먼저 눌러 보기</a></p>
          </div>
        </section>

        {/* ③ 숫자 띠 */}
        <section aria-label="오직 트레이너 한눈에" className="bg-bg px-5 py-[clamp(40px,7vw,72px)]">
          <dl className="mx-auto m-0 grid max-w-[760px] grid-cols-3 gap-3 text-center">
            {FACTS.map((f, i) => (
              <div key={f.n} className="rv flex flex-col items-center gap-2" style={stagger(i)}>
                <dt className="sr-only">{f.t.replace("\n", " ")}</dt>
                <dd className="m-0 text-[clamp(32px,7vw,56px)] font-black leading-none tracking-[-0.04em] tabular-nums">{f.n}</dd>
                <dd className="m-0 whitespace-pre-line text-[clamp(14px,2.2vw,17px)] leading-[1.45] text-sub" aria-hidden="true">{f.t}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ③-1 후기 — 실제 후기 3개 이상일 때만 */}
        {REVIEWS.length >= 3 && (
          <section className="bg-card px-5 py-[clamp(56px,9vw,96px)]">
            <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
              <h2 className={`rv ${H2} ${H2_MD}`}>먼저 써본 트레이너들</h2>
              <ul className="m-0 grid w-full list-none gap-3 p-0 sm:grid-cols-3">
                {REVIEWS.map((r, i) => (
                  <li key={r.name} className="rv rounded-2xl border border-line bg-card p-5 text-left" style={stagger(i)}>
                    <p className="m-0 text-[15.5px] font-semibold leading-[1.55]">{r.quote}</p>
                    <p className="m-0 mt-3 text-[13px] text-sub">{r.name} · {r.where}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ④ 왜 */}
        <section className="border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center">
            <h2 className={`rv ${H2} ${H2_LG}`}>
              <span className="block">수업은 2시간,</span>
              <span className="block text-primary">수업 밖 업무는 4시간.</span>
            </h2>
            <p className="rv m-0 max-w-[480px] text-[clamp(16px,2.4vw,19px)] leading-[1.6] text-sub" style={stagger(1)}>
              일지·상담 준비·재등록 챙기기. 실력이 아니라 시간을 먹는 일들을 앱에 넘기세요.
            </p>
            <div className="mt-2 flex w-full justify-center"><BeforeAfter rows={WHY} /></div>
          </div>
        </section>

        {/* ④-1 다른 점 4가지 — 기능 설명 전에 먼저(2026-10-06) */}
        <section id="special" className="scroll-mt-28 border-t border-line bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[clamp(56px,9vw,88px)] text-center">
            <div className="rv flex flex-col items-center gap-4">
              <Pill>핵심 4가지</Pill>
              <h2 className={`m-0 ${H2} ${H2_LG}`}>
                <span className="block">오직 트레이너는</span>
                <span className="block text-primary">이게 다릅니다.</span>
              </h2>
            </div>
            {SPECIAL.map((sp) => (
              <div key={sp.n} className="flex w-full flex-col items-center gap-5">
                <div className="rv flex flex-col items-center gap-3">
                  <span className="flex items-center gap-2 text-[15px] font-black text-primary">
                    <span className="tabular-nums tracking-[0.06em]">{sp.n}</span>
                    <span className="h-px w-5 bg-primary/40" aria-hidden="true" />
                    <span>{sp.pill}</span>
                  </span>
                  <h3 className={H3}>{sp.title[0]}<br />{sp.title[1]}</h3>
                  <p className="m-0 max-w-[520px] text-[clamp(16px,2.4vw,18px)] leading-[1.6] text-sub">{sp.desc}</p>
                </div>
                <div className="rv flex w-full flex-col items-center gap-4" style={stagger(1)}>
                  {sp.visual && <Visual {...sp.visual} />}
                  {sp.steps && <StepShots steps={sp.steps} />}
                  {sp.stepsKey === "log" && <StepShots steps={LOG_STEPS} />}
                  {sp.href && <TryLink href={sp.href} />}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ⑤ 기능 — 트레이너 화면 */}
        <section id="features" className="scroll-mt-28 border-t border-line bg-card px-5 pb-[clamp(56px,10vw,104px)] pt-[clamp(48px,8vw,88px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-16 text-center">
            <div className="rv flex flex-col items-center gap-4">
              <GroupLabel>앱 기능 · 일하는 순서대로</GroupLabel>
              <nav aria-label="기능 묶음" className="flex max-w-[600px] flex-wrap justify-center gap-2">
                {BUNDLES.map((b, i) => (
                  <a key={b.id} href={`#${b.id}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-line-strong bg-card px-3.5 text-[14px] font-bold text-ink no-underline transition-colors hover:bg-elevate">
                    <span className="tabular-nums text-primary">{i + 1}</span> {b.nav}
                  </a>
                ))}
              </nav>
            </div>

            {BUNDLES.map((b) => (
              <Bundle key={b.id} {...b}>
                {b.id === "b-member" && (
                  /* 회원 전용 페이지 알림 — 제품 화면(후기 아님) */
                  <div className="flex w-full max-w-[400px] flex-col items-start gap-2.5 text-left">
                    <span className="text-[13px] font-bold text-sub">회원 전용 페이지 알림</span>
                    {MEMBER_NOTICES.map((t) => (
                      <div key={t} className="rounded-[20px_20px_20px_6px] bg-elevate px-[18px] py-3.5 text-[16px] font-semibold leading-[1.45]">{t}</div>
                    ))}
                  </div>
                )}
              </Bundle>
            ))}

            <div className="rv flex flex-col items-center gap-3.5">
              <p className="m-0 text-[17px] font-extrabold">그리고 수업 밖 나머지도</p>
              <div className="flex max-w-[560px] flex-wrap justify-center gap-2">
                {MORE.map((m) => (
                  <span key={m} className="rounded-full bg-bg px-3.5 py-2 text-[14px] font-semibold">{m}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 체험 띠 — 가입 전에 직접(2026-10-06) */}
        <section className="border-t border-line bg-card px-5 py-[clamp(48px,8vw,80px)]">
          <div className="rv mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center">
            <h2 className={`${H2} ${H2_MD}`}>가입 전에,<br /><span className="text-primary">직접 눌러 보세요.</span></h2>
            <p className="m-0 max-w-[480px] text-[16px] leading-[1.6] text-sub">트레이너 폰과 회원 폰을 나란히 두고 한쪽에서 누르면 다른 폰에 바로 도착해요.</p>
            <div className="flex max-w-[560px] flex-wrap justify-center gap-2">
              {TRY_LINKS.map(([href, label]) => (
                <a key={href} href={href} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line-strong bg-card px-4 text-[15px] font-semibold text-ink no-underline transition-colors hover:bg-elevate">{label} <Arrow /></a>
              ))}
            </div>
          </div>
        </section>

        {/* 중간 행동 띠 */}
        <section className="border-y border-line bg-primary-soft px-5 py-[clamp(48px,8vw,80px)]">
          <div className="rv mx-auto flex max-w-[760px] flex-col items-center gap-7 text-center">
            <p className="m-0 text-[clamp(22px,4.2vw,32px)] font-black leading-[1.4] tracking-[-0.035em]">
              신규·재등록 1건만 더 나와도,<br />
              <span className="text-primary-strong">이용료가 회수됩니다.</span>
            </p>
            <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <Arrow /></a>
          </div>
        </section>

        {/* 태블릿 · PC 버전 제공 — 넓은 화면 모음(2026-10-06 대표) */}
        <section id="devices" className="scroll-mt-28 border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6 text-center">
            <Pill>태블릿 · PC 버전 제공</Pill>
            <h2 className={`rv m-0 ${H2} ${H2_LG}`}>
              <span className="block">큰 화면에선,</span>
              <span className="block text-primary">큰 화면답게.</span>
            </h2>
            <p className="rv m-0 max-w-[540px] text-[clamp(16px,2.4vw,19px)] leading-[1.6] text-sub" style={stagger(1)}>
              폰과 같은 계정으로 태블릿 · PC에서도 열려요. 화면이 넓어지면 목록과 내용을 나란히 놓는 넓은 배치로 바뀌어요. 설치 없이 브라우저로.
            </p>
            <div className="rv w-full" style={stagger(2)}><FeatureGallery items={WIDE} label="태블릿 · PC 화면" /></div>
          </div>
        </section>

        {/* ⑥ 가격 + ⑦ 센터 상자 */}
        <section id="pricing" className="scroll-mt-28 bg-bg px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-7 text-center">
            <h2 className={`rv ${H2} ${H2_MD}`}>7일 무료로 먼저 써보세요.</h2>
            <div className="grid w-full gap-3.5 text-left sm:grid-cols-2">
              {TIERS.map((tier, i) => {
                const plan = PLANS[tier.key];
                return (
                  <div key={tier.key} className={`rv relative flex flex-col gap-4 rounded-2xl bg-card px-6 py-7 shadow-sm ${tier.highlight ? "border-2 border-primary" : "border border-line"}`} style={stagger(i)}>
                    <div className="flex items-center justify-between">
                      <span className="text-[20px] font-black">{plan.name}</span>
                      {tier.highlight && <span className="rounded-full bg-primary px-[11px] py-[5px] text-[12px] font-extrabold text-white">추천</span>}
                    </div>
                    <span className="-mt-2 text-[15px] text-sub">{tier.tagline}</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[15px] text-sub">월</span>
                        <span className="text-[38px] font-black tracking-[-0.04em] tabular-nums">{plan.amount.toLocaleString("ko-KR")}원</span>
                      </div>
                      <div className="text-[14px] text-sub"><s>{plan.regular.toLocaleString("ko-KR")}원</s> · 얼리버드</div>
                      <div className="text-[16px] font-extrabold text-primary-strong">{perDay(plan.amount)}</div>
                    </div>
                    <div className="flex-1 border-t border-line pt-4">
                      <Checks items={tier.feats} />
                    </div>
                    <a href={tier.cta.href} className={`w-full ${tier.highlight ? BTN_PRIMARY : BTN_OUTLINE}`}>{tier.cta.label}</a>
                  </div>
                );
              })}
            </div>
            <p className="m-0 text-[13px] text-sub">부가세 별도 · 7일 무료 후 자동결제 · 언제든 해지</p>

            <div className="rv mt-3 flex w-full flex-col items-center gap-3.5 rounded-3xl bg-ink px-6 py-[clamp(28px,6vw,44px)] text-white">
              <Pill dark>센터 대표님께</Pill>
              <h3 className="m-0 text-[clamp(26px,5vw,36px)] font-black tracking-[-0.04em]">센터 숫자를 한 화면에서.</h3>
              <p className="m-0 mb-1.5 max-w-[420px] text-[16px] leading-[1.55] text-white/75">매출·정산·등록과 이탈·트레이너별 성과를 대표 화면에서.</p>
              <a href="/center" className={BTN_WHITE}>센터 대표용 페이지 보기 <Arrow /></a>
            </div>
          </div>
        </section>

        {/* ⑧ 자주 묻는 질문 */}
        <section id="faq" className="scroll-mt-28 bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <h2 className={`rv ${H2} ${H2_MD}`}>자주 묻는 질문</h2>
            <Faq items={FAQ} />
            <p className="m-0 text-[14px] text-sub">
              더 궁금한 점은 <a href={contactHref()} className="font-bold text-primary-strong underline-offset-2 hover:underline">카카오톡으로 물어보세요</a>.
            </p>
          </div>
        </section>

        {/* ⑨ 만든 사람 + 마무리 */}
        <section className="bg-bg px-5 py-[clamp(64px,11vw,112px)]">
          <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-[18px] text-center">
            <h2 className={`rv ${H2} text-[clamp(24px,4.6vw,36px)] leading-[1.35] [text-wrap:balance]`}>
              <span className="block">트레이너 경력 10년. 팀장·관리자까지 다 해본 사람이</span>
              <span className="block text-primary">답답해서 직접 만들었습니다.</span>
            </h2>
            <p className="rv m-0 max-w-[500px] text-[16px] leading-[1.6] text-sub" style={stagger(1)}>
              어플·노션·스프레드시트를 다 써봤지만 타이핑은 그대로였습니다. 수업 밖 업무를 전부 여기에 녹였습니다.
            </p>
            <h2 className={`rv ${H2} ${H2_LG} mt-10`}>
              <span className="block">오늘 수업 끝나고</span>
              <span className="block">바로 써보세요.</span>
            </h2>
            <div className="rv flex flex-col items-center gap-2.5" style={stagger(1)}>
              <a href="/signup" className={BTN_PRIMARY}>7일 무료로 시작 <Arrow /></a>
              <span className="text-[14px] text-sub">월 {solo.amount.toLocaleString("ko-KR")}원부터</span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

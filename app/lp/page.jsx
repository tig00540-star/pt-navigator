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
import { PLANS, PACKS, SEAT_PRICE } from "@/lib/plans";
import { wonApprox } from "@/lib/format";
import {
  H2, H2_MD, H2_LG, BTN_PRIMARY, BTN_OUTLINE, BTN_WHITE, Header, Footer, useReveal, stagger,
  Pill, Checks, GroupLabel, WhoDoes, Faq, Arrow, LP_CSS, Bundle, FeatureGallery,
} from "./parts";

/* ───────── 데이터 ───────── */

// 기능 사실만(실적 숫자 아님). "0건"은 약속처럼 읽혀 뺐다.
const FACTS = [
  { n: "30초", t: "말로 남기는\n운동일지" },
  { n: "3분", t: "수업 직전\nOT 준비" },
  { n: "5가지", t: "회원이 망설일 때\n할 대답" },
];

// 실제 후기(이름·지역/센터·한 줄) — 허락받은 것만. 3개 모이기 전까지 구간 자체를 숨긴다.
const REVIEWS = [];

// 트레이너가 하는 일 | 앱이 하는 일(2026-10-07) — 실제 동작만. 인바디는 결과지 숫자를 넣는다(대표: 1분이면 충분 · 정직하게).
const WHO = [
  { task: "운동일지", me: "\"벤치프레스 20kg 12개씩 5세트\" **말 한 마디**", app: "종목 · 무게 · 횟수 · 세트 표로 정리, 운동 방법 설명, 회원 폰으로 보내기, 무게 그래프에 쌓기" },
  { task: "인바디", me: "결과지 숫자 입력(**1분**)", app: "처음과 비교, 변화 그래프, 회원 폰에 보여 주기, 상담 자료에 넣기" },
  { task: "OT", me: "**버튼 한 번**(신청서는 회원이 QR로)", app: "이 회원에게 할 말 대본, 오늘 시킬 운동, 망설일 때 대답" },
  { task: "재등록", me: "없음", app: "남은 수업 알림, 처음과 지금 비교, 상담 대본 · 세일즈북" },
  { task: "회원 관리", me: "없음", app: "회원 폰에 남은 수업 · 다음 수업 · 운동 기록 · 몸의 변화" },
  { task: "실적 · 급여", me: "등록할 때 **계약 금액**만 입력", app: "매출 · 급여 · 등록률 · 매달 성적표" },
];

// 오직 트레이너가 다른 점 4가지(2026-10-06 대표) — 기능 설명 전에 먼저. 사진은 '결과 장면', 아래 묶음은 '과정 장면'.
//   '우리만'이라고 쓰지 않는다(경쟁사 확인 전). 문구는 실제 동작만.
const TRY_LINKS = [["/try#qr", "QR로 OT 신청"], ["/try#event", "회원 이벤트"], ["/try#booking", "수업 예약 요청"], ["/try#sign", "운동일지 · 서명"]];

// 운동일지 예시(2026-10-07) — ① 이 문장을 음성으로 실제 음성일지 기능에 넣었다(데모 회원 나개근) ② 앱이 정리한 트레이너 화면 ③ 회원 폰. 결과는 실제 출력(지어내지 않음).
const LOG_STEPS = [
  {
    step: "말하기", who: "트레이너가 한 것",
    quote: "오늘 벤치프레스 20킬로 12개씩 5세트 했어요.",
    extract: [["종목", "벤치프레스"], ["무게", "20kg"], ["횟수", "12회"], ["세트", "5세트"]],
    next: "옆으로 넘기면 앱이 정리한 실제 화면",
    caption: "수업 끝나고 폰에 대고 이 한 마디만 했어요. 받아 적거나 표를 채울 필요가 없어요.",
  },
  { step: "앱이 정리", who: "앱이 만든 화면", img: "/lp/shots/2026-10/T26.webp", alt: "지난 수업: 위 한 마디를 앱이 정리한 운동일지 · 벤치프레스 20kg 12회 5세트와 운동 방법",
    caption: "앱이 종목 · 무게 · 횟수 · 세트를 표로 채우고, 운동 방법까지 써요. 이 기록이 쌓여 무게 변화 그래프가 돼요." },
  { step: "회원 폰", who: "회원 폰 화면", img: "/lp/shots/2026-10/M12.webp", alt: "회원 폰에 도착한 운동일지: 벤치프레스 5세트 20kg 12회 표",
    caption: "같은 운동일지가 회원 폰에 표로 도착해요. 회원은 확인하고 손가락으로 서명해요. 종이 수업 확인서가 필요 없어요." },
];

// 앱 기능 — 일하는 순서대로 5묶음(2026-10-06). 사진 = 데모 센터(지어낸 회원)의 실제 앱 화면.
const BUNDLES = [
  {
    id: "b-ot", nav: "신규 OT",
    pill: "신규 OT",
    title: ["세일즈 몰라도,", "읽고 들어가면 돼요."],
    desc: "회원이 QR로 쓴 신청서를 보고, OT에서 할 말을 앱이 대본으로 써 줘요.",
    point: "망설일 때 대답 5가지 · 오늘 시킬 운동까지",
    checks: ["회원이 QR을 찍어 OT를 신청하면서 원하는 시간 · 목표 · 아픈 곳을 미리 적어요", "OT 들어가기 전, 할 말과 오늘 시킬 운동을 앱이 정리해 줘요", "OT가 끝나면 결과를 몇 번 눌러 남기고, 그 내용으로 다음 OT를 준비해요"],
    core: { img: "/lp/shots/2026-10/T09b.webp", alt: "OT 대본의 클로징: 추천 플랜 대사와 가격 한 줄 · 요청 '다음 주부터 바로 시작하시죠' · 이어서 웃으며 가벼운 한마디",
        who: "앱이 만든 화면",
        caption: "회원이 QR로 쓴 신청서와 내 가격표로 앱이 쓴 대사예요. OT 마지막에 읽기만 하면 돼요. 추천 횟수 · 가격, 요청 한 마디, 웃으며 덧붙일 말까지 나와요.",
    },
    items: [
      { name: "왜 PT가 필요한지", desc: "이 회원에게 맞춘 이유와 '왜 지금인지'", img: "/lp/shots/2026-10/T09.webp", alt: "OT 대본의 클로징 앞부분: 왜 PT가 필요한지 · 확인 질문" },
      { name: "한눈에 요약", desc: "이 회원 · 오늘 꼭 할 것 · 등록 제안을 세 줄로", img: "/lp/shots/2026-10/T07.webp", alt: "OT 대본 맨 위 30초 요약: 이 회원 · 오늘 꼭 · 요청 한 줄씩" },
      { name: "QR 신청서", desc: "회원이 폰으로 원하는 요일 · 시간을 직접", img: "/lp/shots/2026-10/T02.webp", alt: "회원이 보는 OT 신청서: 원하는 요일 · 시간 고르기" },
      { name: "신청 알림", desc: "신청이 들어오면 바로 내 폰에", img: "/lp/shots/2026-10/T04.webp", alt: "트레이너 홈의 새 OT 회원 카드: 내 QR로 신청 · 원하는 시간" },
      { name: "신청서 내용 한눈에", desc: "목표 · 주 몇 번 올 수 있는지 · 아직 못 물어본 것", img: "/lp/shots/2026-10/T06.webp", alt: "OT 회원 대시보드: 목표 · 운동 가능 횟수 · 알게 된 경로 · 원하는 시간 · 아직 모르는 것" },
      { name: "오늘 시킬 운동 4개", desc: "몸 상태 확인부터 회원이 '달라졌다' 느끼는 마무리까지", img: "/lp/shots/2026-10/T08.webp", alt: "1차 OT 대본의 오늘 운동 4칸과 할 말" },
      { name: "망설일 때 대답 5가지", desc: "'생각해볼게요' · '비싸요' · '효과 있을까요' · '시간이 없어요' · '다른 데랑 비교'", img: "/lp/shots/2026-10/T10.webp", alt: "OT 대본의 거절 대응 5가지" },
      { name: "OT 결과 남기기", desc: "등록 · 다음 OT · 그만 중에 누르면 다음 준비로", img: "/lp/shots/2026-10/T13.webp", alt: "OT 피드백: 등록했어요 · 다음 OT 이어가요 · 그만하기로 했어요" },
    ],
    href: "/try#qr",
  },
  {
    id: "b-renew", nav: "재등록",
    pill: "재등록",
    title: ["재등록 상담 자료,", "따로 안 만들어도 돼요."],
    desc: "수업 때마다 남긴 기록으로, 회원에게 보여 줄 '이만큼 변했어요' 화면이 저절로 생겨요.",
    point: "남은 수업이 10회 아래면 앱이 먼저 알려줘요",
    checks: ["남은 수업이 줄어든 회원을 앱이 먼저 알려줘요", "인바디 · 운동일지로 그동안 달라진 것을 정리해요", "재등록 권할 때 할 말과 보여 줄 자료까지 준비해요"],
    core: {
      img: "/lp/shots/2026-10/R03p.webp", alt: "재등록 세일즈북의 숫자로 확인된 변화: 인바디와 대표 종목 무게의 처음 · 지금 · 변화",
      who: "앱이 만든 화면",
      caption: "재등록 상담 때 회원에게 보여 주는 이 화면도 앱이 만들어요. 숫자는 그동안 기록된 인바디와 무게 그대로라, 회원이 믿어요.",
    },
    items: [
      { name: "처음과 지금 비교", desc: "기록이 쌓이면 앱이 알아서 나란히", img: "/lp/shots/2026-10/R01.webp", alt: "PT 회원 대시보드: 이번 계약 14/20회와 처음보다 달라진 것(체중 · 골격근량 · 체지방률 · 레그프레스)" },
      { name: "재등록 상담 요약", desc: "상담 들어가기 전에 읽는 세 줄", img: "/lp/shots/2026-10/T15.webp", alt: "재등록 상담 대본의 30초 요약" },
      { name: "재등록 알림", desc: "남은 수업 10회 미만 회원 목록", img: "/lp/shots/2026-10/T14.webp", alt: "오늘 탭의 재등록 타이밍 카드: 잔여 10회 미만 회원 목록" },
      { name: "함께한 기록", desc: "함께한 기간 · 한 수업 수 · 주 몇 번 왔는지", img: "/lp/shots/2026-10/R02.webp", alt: "재등록 세일즈북의 그동안의 여정: 1개월 · 14회 · 주 2.2회 · 남은 6회", wide: true },
      { name: "목표까지 남은 단계", desc: "지금 어디쯤이고 앞으로 무엇을 할지", img: "/lp/shots/2026-10/R04.webp", alt: "재등록 세일즈북의 지금 어디까지 · 앞으로: 단계별 로드맵", wide: true },
    ],
  },
  {
    id: "b-book", nav: "세일즈북",
    pill: "세일즈북",
    title: ["등록 권하기 직전 2분,", "폰을 돌려 보여 주세요."],
    checks: ["회원 한 명을 위한 발표 자료를 앱이 만들어 줘요(한 장씩 넘기는 가로 화면)", "목표 → 앞으로의 계획 → 추천 PT → 가격 순서로", "PT 가격표는 내가 정해 둔 가격 그대로, 어느 장에서든 바로 띄워요"],
    desc: "등록 권할 때 보여 줄 발표 자료를 앱이 회원 한 명에 맞춰 만들어 줘요. 목표 → 계획 → 추천 PT → 가격 순서로.",
    point: "다른 회원의 비포 · 애프터 사례도 넣을 수 있어요",
    hero: { img: "/lp/shots/2026-10/S03.webp", alt: "세일즈북 발표 화면(가로): 오늘 함께 확인한 것 · 제가 본 원인 · 바꿔 드릴 방향", wide: true, who: "앱이 만든 화면", caption: "OT에서 함께 해 본 것과 회원 목표로 앱이 만든 발표 장이에요. 폰을 가로로 돌려 한 장씩 넘기며 보여 줘요." },
    items: [
      { name: "목표까지 계획", desc: "지금부터 목표까지 단계별로", img: "/lp/shots/2026-10/S05.webp", alt: "세일즈북 로드맵 장: 지금 여기 1단계부터 6단계 목표까지", wide: true },
      { name: "추천 PT", desc: "이 회원에게 맞는 횟수와 이유", img: "/lp/shots/2026-10/S06.webp", alt: "세일즈북 추천 플랜 장: 추천 코스와 다른 코스, 회당 가격", wide: true },
      { name: "마지막 장", desc: "트레이너가 지킬 약속(손글씨)", img: "/lp/shots/2026-10/S07.webp", alt: "세일즈북 마지막 장: 트레이너가 지키는 것들과 손글씨 약속", wide: true },
      { name: "PT 가격표", desc: "내가 정한 패키지 가격과 회당 가격", img: "/lp/shots/2026-10/T12.webp", alt: "PT 가격표: 패키지별 회차 · 기간 · 가격 · 회당 가격" },
    ],
  },
  {
    id: "b-pt", nav: "PT 회원 관리",
    pill: "PT 회원 관리",
    title: ["운동일지,", "타자 치지 말고 말하세요."],
    desc: "수업 끝나고 오늘 한 운동을 폰에 대고 말하면, 앱이 운동일지로 정리해 회원 폰으로 보내요.",
    point: "종목 · 무게를 칠 필요도 없어요. 말하면 끝",
    checks: ["수업 끝나고 말로 운동일지, 회원 서명까지", "회원이 보낸 수업 변경 · 취소 요청을 한 번 눌러 처리해요", "재등록할 회원 · 서명 안 한 회원 · 인바디 잴 회원을 앱이 먼저 알려줘요"],
    core: { steps: LOG_STEPS },
    items: [
      { name: "수업 요청 승인", desc: "회원이 보낸 변경 · 취소 · 새 수업을 한 번에", img: "/lp/shots/2026-10/T21.webp", alt: "트레이너 홈의 수업 요청 카드: 회원이 보낸 취소 · 시간 변경 · 새 수업 요청과 승인 · 거절 버튼" },
      { name: "수업 확인서", desc: "한 달 수업을 회원 서명과 함께 한 장으로(종이 대신)", img: "/lp/shots/2026-10/T19.webp", alt: "한 달 수업을 회원 서명과 함께 모은 수업 확인서" },
      { name: "스케줄", desc: "주간 표 · 개인 일정 · 회원 요청까지", img: "/lp/shots/2026-10/T20.webp", alt: "트레이너 주간 스케줄" },
      { name: "개인운동 루틴", desc: "PT 없는 날 회원이 혼자 할 운동을 PT 기록으로", img: "/lp/shots/2026-10/T23.webp", alt: "회원 개인운동 루틴 카드" },
      { name: "회원 이벤트", desc: "'이번 달 12번 오면 선물' 같은 출석 이벤트", img: "/lp/shots/2026-10/T22.webp", alt: "트레이너 설정의 이벤트 관리: 출석 챌린지 참여 명단과 달성 여부" },
      { name: "오운완 랭킹", desc: "이번 달 운동 많이 한 회원 순위(오운완 = 오늘 운동 완료)", img: "/lp/shots/2026-10/T24.webp", alt: "트레이너 홈의 오운완 랭킹" },
      { name: "운동일지 고쳐 달라는 요청", desc: "회원이 '내용이 달라요'를 누르면 바로", img: "/lp/shots/2026-10/T25.webp", alt: "회원이 '내용이 달라요'를 누른 운동일지와 회원 메모" },
    ],
    href: "/try#booking",
  },
  {
    id: "b-member", nav: "회원 전용 페이지",
    pill: "회원 전용 페이지",
    title: ["회원 폰에", "'내 PT' 화면이 생겨요."],
    desc: "앱 설치 없이, 카톡으로 보낸 링크 하나로 열려요. 남은 수업 · 운동 기록 · 몸의 변화가 늘 최신이에요.",
    point: "회원이 묻기 전에 폰에서 먼저 봐요",
    checks: ["앱 설치 없이 링크로 여는 회원용 화면", "운동일지 · 인바디 · 무게 변화를 회원이 직접 봐요", "출석 · 이벤트 참여 · 수업 예약 요청까지 회원이 직접 해요"],
    core: {
      img: "/lp/shots/2026-10/M01.webp", alt: "회원 전용 페이지 내 PT: 남은 수업 12회 / 32회 · 수업 일정 · 시간 바꾸기 · 취소하기 · 새 수업 요청하기",
      who: "회원 폰 화면 · 앱이 알아서 채워요",
      caption: "트레이너가 따로 보내지 않아도, 남은 수업과 다음 수업 시간이 회원 폰에 늘 최신으로 떠요. 시간 변경도 여기서 요청해요.",
    },
    items: [
      { name: "인바디 변화", desc: "숫자를 넣으면 회원 폰에 지난번과 비교", img: "/lp/shots/2026-10/M09.webp", alt: "회원 인바디 변화: 체중 · 골격근량 · 체지방량 · 체지방률 · 기초대사량 · 내장지방" },
      { name: "새 수업 요청", desc: "트레이너 빈 시간만 골라 요청", img: "/lp/shots/2026-10/M06.webp", alt: "새 수업 요청: 이번 주 · 다음 주 날짜와 시간 고르기(트레이너 일정 있는 칸은 흐리게)" },
      { name: "운동일지", desc: "오늘 한 운동과 지난번보다 늘어난 무게", img: "/lp/shots/2026-10/M08.webp", alt: "회원 운동일지: 종목별 세트 · 무게 · 횟수 표와 지난번보다 늘어난 무게" },
      { name: "운동 달력", desc: "PT · 개인운동 · 유산소를 한 달에", img: "/lp/shots/2026-10/M07.webp", alt: "회원 운동 달력: PT · 개인운동 · 유산소를 색 점으로" },
      { name: "무게 변화", desc: "종목별로 얼마나 늘었는지", img: "/lp/shots/2026-10/M10.webp", alt: "회원 종목별 무게 변화 그래프" },
      { name: "개인운동 루틴", desc: "혼자 오는 날 할 것과 트레이너 한마디", img: "/lp/shots/2026-10/M11.webp", alt: "회원 개인운동 루틴: 오늘 할 부위 · 트레이너 한마디 · 세트별 무게와 횟수" },
      { name: "목표까지 단계", desc: "지금 몇 단계인지, 앞으로 남은 것", img: "/lp/shots/2026-10/M04.webp", alt: "회원 목표 로드맵: 지나온 단계와 지금 단계, 남은 단계" },
      { name: "이벤트 참여", desc: "출석 챌린지 진행과 상품", img: "/lp/shots/2026-10/M05.webp", alt: "회원 이벤트 자세히: 10월 출석 챌린지 기간 · 상품 · 진행 5/12회" },
      { name: "오운완(오늘 운동 완료)", desc: "운동한 날 · 며칠 연속 · 배지", img: "/lp/shots/2026-10/M03.webp", alt: "회원 오운완 카드: 이번 달 · 누적 · 연속과 배지" },
    ],
  },
];

// 회원 전용 페이지에 실제로 뜨는 문구 — 후기가 아니라 제품 화면이다(실제 폰 알림 사진이 오면 바꾼다).
const MEMBER_NOTICES = ["오늘 운동일지가 도착했어요", "이번 달 출석 8회, 오운완 챌린지 진행 중"];

// 태블릿 · PC 버전 — 같은 계정이 넓은 배치로(2026-10-06 · 데모 센터 실제 화면 · 넓은 홈은 1024px부터)
const WIDE = [
  { device: "pc", name: "회원 관리", desc: "회원 목록 · 회원 정보 · 지난 수업을 한 화면에", img: "/lp/shots/2026-10/W02.webp", alt: "PC 회원 화면: 왼쪽 회원 목록, 가운데 PT 대시보드, 오른쪽 지난 수업" },
  { device: "pc", name: "OT 대본", desc: "회원 목록 옆에 대본을 펼쳐 놓고", img: "/lp/shots/2026-10/W03.webp", alt: "PC OT 대본: 30초 요약 · 입장 첫마디 · 오늘 운동 4개" },
  { device: "pc", name: "PC 첫 화면", desc: "오늘 일정 · 챙길 회원 · 회원 소식", img: "/lp/shots/2026-10/P01.webp", alt: "PC 넓은 홈: 오늘 수업 · 오늘 일정 · 챙길 회원 · 회원 쪽 소식 · 오운완 랭킹" },
  { device: "pc", name: "내 실적", desc: "성적표 · 예상 급여 · 매출 · 등록률", img: "/lp/shots/2026-10/W06.webp", alt: "PC 내 실적: 지난달 성적표 · 이달 예상 급여 · 이달 매출과 목표 · 등록률 · 수업 수" },
  { device: "tablet", name: "주간 스케줄", desc: "스케줄과 오늘 할 일을 나란히", img: "/lp/shots/2026-10/P02.webp", alt: "태블릿 주간 스케줄과 오늘 할 일(이탈 위험 · 새 OT 회원 · 수업 요청)" },
  { device: "tablet", name: "재등록 상담 대본", desc: "회원 목록 옆에 요약과 할 말", img: "/lp/shots/2026-10/W04.webp", alt: "태블릿 재등록 상담 대본: 30초 요약과 수업 순서별 대사" },
  { device: "tablet", name: "세일즈북 발표", desc: "회원 앞에 태블릿을 놓고 한 장씩", img: "/lp/shots/2026-10/W05.webp", alt: "태블릿 세일즈북 발표: 숫자로 확인된 변화 장" },
];

// 사진 없이 이름만 — 묶음 아래 한 줄
const MORE = ["매달 내 성적표", "인바디 분석", "비포 · 애프터 사례 모음", "폰 알림", "급여 자동계산", "프리랜서 장부"];

// 요금제 3장(2026-10-07 개편 · 금액 = 부가세 포함 실제 결제 · lib/plans 한 곳)
const TIERS = [
  {
    key: "basic",
    tagline: "트레이너 1인 · AI는 맛보기",
    feats: ["회원 관리 · 스케줄 · 운동일지 직접 입력", "회원용 화면 · 운동일지 회원 서명", "QR OT 신청서 · 수업 예약 요청 · 이벤트", "실적 · 급여 · 장부 계산", "AI 기능마다 매달 3번 써 보기"],
    highlight: false,
    cta: { label: "시작하기", href: "/signup?plan=basic" },   // 고른 요금제를 가입 → 결제 화면까지 들고 간다(2026-10-07)
  },
  {
    key: "solo",
    tagline: "AI까지 트레이너 1인",
    feats: ["베이직 전부", `말로 쓰는 운동일지 월 ${PLANS.solo.ai.voice}건`, `OT · 재등록 대본 월 ${PLANS.solo.ai.prep}번`, "세일즈북(상담 자료) · 인바디 분석"],
    highlight: true,
    cta: { label: "시작하기", href: "/signup?plan=solo" },
  },
  {
    key: "center",
    tagline: "트레이너 3인 + 대표 1인",
    feats: ["프로 전부(센터가 함께 쓰는 한도)", `말로 쓰는 운동일지 월 ${PLANS.center.ai.voice}건 · 대본 월 ${PLANS.center.ai.prep}번`, "대표 화면 · 아침 보고서 · 월간 결산", `트레이너 추가 1인 월 ${SEAT_PRICE.toLocaleString("ko-KR")}원`],
    highlight: false,
    cta: { label: "센터로 시작하기", href: "/signup?type=center" },   // 상품 카드마다 바로 결제 경로(토스 심사 2026-10-07) · 센터 소개는 아래 띠 · 머리 전환
  },
];

const FAQ = [
  { q: "설치해야 하나요?", a: "아니요. 브라우저로 바로 쓰고, 홈 화면에 추가하면 앱처럼 열립니다." },
  { q: "어떤 기기에서 되나요?", a: "폰에 맞춰 만들었고, 태블릿 · PC에서는 넓은 화면에 맞춘 배치로 열려요. 같은 계정이라 어디서 열어도 기록이 그대로예요." },
  { q: "AI가 대신 팔아주나요?", a: "아니요. 회원을 보고 판단하는 건 트레이너, 할 말을 정리해 주는 건 앱이에요." },
  { q: "회원 정보는 안전한가요?", a: "계정별로 데이터가 분리되고, 회원은 본인 것만 봅니다." },
  { q: "센터에 소속돼 있는데 혼자 써도 되나요?", a: "네. 개인 트레이너로 가입하고 '센터 소속'을 고르면 돼요. 회원 페이지와 OT 신청서엔 '○○짐 · 내 이름 트레이너'로 나와요." },
  { q: "프리랜서도 되나요?", a: "네. '프리랜서'를 고르면 PT 매출 · 그 밖의 매출 · 지출 · 남은 돈을 장부로 함께 봐요. 센터와 매출을 나누면 그 방식도 정할 수 있어요." },
  { q: "가입 전에 써 볼 수 있나요?", a: "네. '직접 눌러 보기'에서 트레이너 폰과 회원 폰을 나란히 두고 QR 신청 · 이벤트 · 수업 요청 · 서명을 해 볼 수 있어요." },
  { q: "AI를 다 쓰면 어떻게 되나요?", a: `기록 · 회원 관리는 그대로 쓰고, AI만 다음 달 1일까지 멈춰요. 프로는 추가 팩(OT · 재등록 대본 10번 ${PACKS.prep10.price.toLocaleString("ko-KR")}원 · 운동일지 50건 ${PACKS.voice50.price.toLocaleString("ko-KR")}원)으로 바로 이어 쓸 수 있어요. 산 팩은 7일 안에 한 번도 안 썼을 때만 전액 환불돼요.` },
  { q: "써 보고 마음에 안 들면요?", a: "첫 결제 뒤 7일 안이면 써 봤어도 전액 환불해 드려요. 설정 › 구독 관리에서 버튼 한 번이면 돼요(계정당 한 번)." },
  { q: "베이직에서 프로로 바꿀 수 있나요?", a: "네. 설정에서 바로 바뀌어요. 남은 기간만큼 차액만 내면 돼요." },
  { q: "의료·재활 목적인가요?", a: "아니요. 운동 지도·세일즈·회원관리 도구입니다." },
];

const perDay = (amount) => `하루 약 ${wonApprox(amount / 30)}`;

/* ───────── 페이지 ───────── */

export default function LandingPage() {
  const rootRef = useRef(null);
  useReveal(rootRef);
  const basic = PLANS.basic;

  return (
    <div ref={rootRef} className="min-h-dvh bg-card text-ink antialiased [word-break:keep-all]">
      <style>{LP_CSS}</style>
      <Header
        page="trainer"
        nav={[["#features", "기능"], ["#pricing", "가격"], ["#faq", "자주 묻는 질문"]]}
        cta={{ label: "시작하기", href: "/signup" }}
      />

      <main>
        {/* ② 첫 화면 — 효과 없음 */}
        <section className="bg-card px-5 pb-[clamp(56px,10vw,112px)] pt-[clamp(48px,9vw,112px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-[22px] text-center">
            <span className="inline-flex min-h-[34px] items-center rounded-full border border-primary/15 bg-primary-soft px-4 text-[14px] font-bold text-primary-strong">
              트레이너가 직접 만든 PT 세일즈·회원관리 앱
            </span>
            <h1 className="m-0 text-[clamp(36px,8vw,60px)] font-black leading-[1.16] tracking-[-0.045em]">
              <span className="block">트레이너는 말만 하세요.</span>
              <span className="block text-primary">기록하고 정리하는 건 앱이.</span>
            </h1>
            <p className="m-0 max-w-[540px] text-[clamp(17px,2.6vw,20px)] leading-[1.6] text-sub">
              운동일지 · 회원 변화 · 재등록 자료 · OT 대본까지, 앱이 기록하고 앱이 정리해요.
            </p>
            <div className="mt-1.5 flex w-full max-w-[420px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
              <a href="/signup" className={BTN_PRIMARY}>지금 시작하기 <Arrow /></a>
              {/* InstallAppButton은 자체 클래스(레드 채움)를 갖고 있어 겹치는 속성은 !로 덮는다. */}
              <InstallAppButton
                className="!min-h-[52px] justify-center !rounded-xl !border !border-line-strong !bg-card !px-6 !py-0 !text-[17px] !text-ink hover:!bg-elevate"
                label="앱처럼 설치"
              />
            </div>
            <p className="m-0 text-[14px] text-sub">설치 없이 폰에서 바로 · 7일 안에 전액 환불 · <a href="/try" className="font-bold text-primary-strong underline-offset-2 hover:underline">가입 없이 먼저 눌러 보기</a></p>
          </div>
        </section>

        {/* ③ 숫자 띠 */}
        <section aria-label="오직 트레이너 한눈에" className="border-t border-line bg-card px-5 py-[clamp(40px,7vw,72px)]">
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
              <span className="block">트레이너가 할 일은,</span>
              <span className="block text-primary">이게 다예요.</span>
            </h2>
            <p className="rv m-0 max-w-[480px] text-[clamp(16px,2.4vw,19px)] leading-[1.6] text-sub" style={stagger(1)}>
              일지 쓰기 · 변화 정리 · 상담 준비 · 재등록 챙기기. 나머지는 앱이 기록하고 정리해요.
            </p>
            <div className="mt-2 flex w-full justify-center"><WhoDoes rows={WHO} /></div>
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
        <section className="border-t border-line bg-card px-5 py-[clamp(48px,8vw,80px)]">
          <div className="rv mx-auto flex max-w-[760px] flex-col items-center gap-7 text-center">
            <p className="m-0 text-[clamp(22px,4.2vw,32px)] font-black leading-[1.4] tracking-[-0.035em]">
              신규·재등록 1건만 더 나와도,<br />
              <span className="text-primary-strong">이용료가 회수됩니다.</span>
            </p>
            <a href="/signup" className={BTN_PRIMARY}>지금 시작하기 <Arrow /></a>
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
        <section id="pricing" className="scroll-mt-28 border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[1040px] flex-col items-center gap-7 text-center">
            <h2 className={`rv ${H2} ${H2_MD}`}>써 보고 아니면, 7일 안에 전액 환불.</h2>
            <div className="grid w-full max-w-[420px] gap-3.5 text-left md:max-w-none md:grid-cols-3">
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
                      {plan.regular ? <div className="text-[14px] text-sub"><s>{plan.regular.toLocaleString("ko-KR")}원</s> · 얼리버드</div> : <div className="text-[14px] text-sub">AI는 기능마다 매달 3번</div>}
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
            <p className="m-0 max-w-[520px] text-center text-[13px] leading-[1.6] text-sub">부가세 포함 · <strong className="font-bold text-ink">1개월 단위 정기결제(이용 기간 1개월)</strong> · 카드를 등록하면 바로 첫 결제, 이후 매달 같은 날 자동 결제 · <strong className="font-bold text-ink">첫 결제 7일 안에는 써 봤어도 전액 환불</strong>(계정당 한 번) · 언제든 해지(남은 기간까지 이용) · <a href="/legal/refund" className="font-bold text-ink underline underline-offset-2">환불 정책</a></p>

            <div className="rv mt-3 flex w-full flex-col items-center gap-3.5 rounded-3xl bg-ink px-6 py-[clamp(28px,6vw,44px)] text-white">
              <Pill dark>센터 대표님께</Pill>
              <h3 className="m-0 text-[clamp(26px,5vw,36px)] font-black tracking-[-0.04em]">센터 숫자를 한 화면에서.</h3>
              <p className="m-0 mb-1.5 max-w-[420px] text-[16px] leading-[1.55] text-white/75">매출·정산·등록과 이탈·트레이너별 성과를 대표 화면에서.</p>
              <a href="/center" className={BTN_WHITE}>센터 대표용 페이지 보기 <Arrow /></a>
            </div>
          </div>
        </section>

        {/* ⑧ 자주 묻는 질문 */}
        <section id="faq" className="scroll-mt-28 border-t border-line bg-card px-5 py-[clamp(56px,10vw,104px)]">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <h2 className={`rv ${H2} ${H2_MD}`}>자주 묻는 질문</h2>
            <Faq items={FAQ} />
            <p className="m-0 text-[14px] text-sub">
              더 궁금한 점은 <a href={contactHref()} className="font-bold text-primary-strong underline-offset-2 hover:underline">카카오톡으로 물어보세요</a>.
            </p>
          </div>
        </section>

        {/* ⑨ 만든 사람 + 마무리 */}
        <section className="border-t border-line bg-card px-5 py-[clamp(64px,11vw,112px)]">
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
            <div data-nosnippet="" className="rv flex flex-col items-center gap-2.5" style={stagger(1)}>
              <a href="/signup" className={BTN_PRIMARY}>지금 시작하기 <Arrow /></a>
              <span className="text-[14px] text-sub">월 {basic.amount.toLocaleString("ko-KR")}원부터</span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

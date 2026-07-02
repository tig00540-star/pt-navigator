"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Armchair,
  Brain,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  Dumbbell,
  Filter,
  Flame,
  Footprints,
  Gauge,
  Handshake,
  Heart,
  Lightbulb,
  MapPin,
  MessageSquareQuote,
  Microscope,
  Pause,
  Play,
  Repeat,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Target,
  TrendingUp,
  User,
  UserPlus,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fmt } from "@/lib/format";
import Eyebrow from "@/components/ui/Eyebrow";
import VoiceLogTab from "@/components/tabs/VoiceLogTab";

/* =========================================================================
   HARDCODED DATA  —  1차 OT 세일즈 네비게이터
   ========================================================================= */

const DEMO_MEMBER = {
  name: "김철수",
  age: 34,
  job: "IT 개발자",
  residence: "센터 인근 오피스텔",
  mbti: "ISTJ",
  pain: "우측 무릎 통증",
  goal: "바디프로필",
  session: "1차 OT",
  summary: [
    "논리와 근거로 움직이는 실용주의자 — '왜'가 해결되면 즉시 실행에 옮기는 결과지향형.",
    "장시간 좌식 근무로 고관절 굴곡근 단축 추정 → 우측 무릎에 누적 부하가 걸릴 구조.",
    "목표(바디프로필)가 명확 → 감성 어필보다 수치·마일스톤·역산 계획에 강하게 반응.",
  ],
};

/* Supabase user_table 한 행 → 화면이 기대하는 회원 형태로 매핑 */
function mapMemberRow(r) {
  return {
    id: r.id,
    name: r.name,
    age: r.age ?? "-",
    job: r.job ?? "-",
    residence: r.residence ?? "-",
    mbti: r.mbti ?? "-",
    pain: r.pain ?? "-",
    goal: r.goal ?? "미설정",
    machines: r.machines ?? [],
    session: "1차 OT",
    summary: r.name === DEMO_MEMBER.name
      ? DEMO_MEMBER.summary
      : ["AI 성향 요약은 회원 데이터를 바탕으로 곧 생성됩니다."],
  };
}

const SALES_SCRIPT = [
  {
    tag: "오프닝",
    icon: Sparkles,
    line: "오늘은 감으로 운동하는 시간 없이, 철수님 무릎 부하 원인부터 수치로 찍고 시작할게요.",
  },
  {
    tag: "신뢰 구축",
    icon: ShieldCheck,
    line: "개발하실 때 로그 안 보고 디버깅 안 하시죠? 몸도 똑같아요. 인바디랑 가동성 측정값이 저희 로그예요.",
  },
  {
    tag: "니즈 확인",
    icon: Target,
    line: "바디프로필까지 몇 주 남으셨어요? 역산해서 주차별 목표 체지방·근육량 딱 잡아드릴게요.",
  },
  {
    tag: "통증 안심",
    icon: Activity,
    line: "무릎은 '피하는' 게 아니라 '우회'가 정답이에요. 오늘 통증 0으로 하체 자극 넣는 세팅 보여드릴게요.",
  },
  {
    tag: "클로징",
    icon: Handshake,
    line: "오늘 결과 기준으로, 이 세팅 12주 유지 시 예상 수치 정리해 드릴게요. 판단은 데이터 보고 하세요.",
  },
];

const PHASES = [
  {
    id: "assess",
    n: "01",
    title: "체형 평가 & 인바디 리뷰",
    range: "0 – 10분",
    duration: 10,
    color: "sky",
    icon: User,
    goals: ["정적 정렬·좌우 비대칭 체크", "인바디 수치 → 목표 역산", "우측 무릎 부하 가설 공유"],
  },
  {
    id: "mobility",
    n: "02",
    title: "가동성 테스트 (무릎·고관절)",
    range: "10 – 20분",
    duration: 10,
    color: "lime",
    icon: Gauge,
    goals: ["무릎 굴곡 통증 각도 측정", "고관절 내·외전 ROM 확인", "안전 운동 각도 확정"],
  },
  {
    id: "main",
    n: "03",
    title: "메인 운동 (통증 우회 하체)",
    range: "20 – 45분",
    duration: 25,
    color: "orange",
    icon: Dumbbell,
    goals: ["센터 기구 매칭 루틴 실행", "통증 0 유지하며 자극 확인", "'되네?' 순간 만들기"],
  },
  {
    id: "closing",
    n: "04",
    title: "세일즈 클로징 (데이터 브리핑)",
    range: "45 – 60분",
    duration: 15,
    color: "emerald",
    icon: Handshake,
    goals: ["오늘 측정값 요약 브리핑", "12주 예상 수치 제시", "등록 제안 → 데이터로 결정 유도"],
  },
];

const ROUTINE = [
  {
    id: "r1",
    name: "글루트 브리지",
    machine: "맨몸",
    sets: "15회 × 3",
    safe: "무릎 부하 0. 둔근 점화로 세션 시작.",
    muscles: ["둔근", "코어"],
  },
  {
    id: "r2",
    name: "레그프레스 (하이·와이드 스탠스)",
    machine: "이카리안",
    sets: "15회 × 3",
    safe: "ROM 90° 이내 제한 → 대퇴사두 과부하 없이 하체 볼륨.",
    muscles: ["둔근", "햄스트링"],
  },
  {
    id: "r3",
    name: "힙 어브덕션 (아웃싸이)",
    machine: "Gym80",
    sets: "20회 × 3",
    safe: "중둔근 강화 → 무릎 밸구스 억제, 정렬 안정화.",
    muscles: ["중둔근"],
  },
  {
    id: "r4",
    name: "레그프레스 카프레이즈",
    machine: "이카리안",
    sets: "20회 × 3",
    safe: "무릎 잠금 없이 종아리 마무리 자극.",
    muscles: ["비복근"],
  },
];

/* ---- 재정 추정 (직업·나이 기반) ---- */
const FINANCE = {
  estIncome: "6,000 – 8,500만원",
  bracket: "중상위 · 여유 있음",
  reasons: [
    "34세 IT 개발자 → 미들~시니어 구간, 국내 개발직 평균 상회 추정.",
    "1인 오피스텔 단독 거주 → 부양 부담 낮고 자기투자 지출 성향 높음.",
    "목표(바디프로필)가 명확 → 결과에 대한 지불 의향(WTP)이 높은 유형.",
  ],
};

/* ---- PT 패키지 제안 (금액은 상담용 추정치) ---- */
const PACKAGES = [
  {
    id: "starter",
    name: "스타터",
    sessions: 12,
    weeks: "주 2회 · 6주",
    perSession: 65000,
    total: 780000,
    note: "감 잡기용. 목표엔 다소 부족.",
    recommended: false,
  },
  {
    id: "core",
    name: "바디프로필 코어",
    sessions: 24,
    weeks: "주 2~3회 · 12주",
    perSession: 60000,
    total: 1440000,
    note: "12주 역산 시 목표 데드라인에 정확히 도달.",
    recommended: true,
  },
  {
    id: "premium",
    name: "프리미엄",
    sessions: 36,
    weeks: "주 3회 · 12주",
    perSession: 55000,
    total: 1980000,
    note: "최단기간 완성 · 회당 단가 최저.",
    recommended: false,
  },
];

const won = (n) => "₩" + n.toLocaleString("ko-KR");

/* ---- 운동 직후 상태 → 클로징 빌더 옵션 ---- */
const STIMULUS = ["둔근", "햄스트링", "중둔근", "종아리"];
const KNEE = [
  { id: "down", label: "통증 감소" },
  { id: "same", label: "변화 없음" },
  { id: "tight", label: "약간 뻐근" },
];
const MOOD = [
  { id: "fresh", label: "개운 · 상쾌" },
  { id: "good", label: "뻐근하지만 만족" },
  { id: "hard", label: "많이 힘들었음" },
];

/* 상태 조합 → 클로징 대본 조립 (ISTJ · 데이터 프레이밍) */
function buildClosing(state, pkg) {
  const kneeLine = {
    down: "방금 무릎 통증 없이 하체 자극이 들어갔죠? 오늘 세팅이 철수님 무릎에 안전하다는 걸 몸이 직접 증명했어요.",
    same: "무릎이 운동 내내 편안했죠? 통증 0으로 자극이 들어간다는 게 오늘 데이터로 확인됐어요.",
    tight: "지금 뻐근한 건 근육이지 관절이 아니에요 — 이게 우리가 노린 '안전한 자극'의 신호예요.",
  }[state.knee];

  const moodLine = {
    fresh: "이 개운한 기분은 혈류가 돌면서 나오는 정상 반응이에요. 주 2회면 이 컨디션이 일상이 됩니다.",
    good: "내일 오는 가벼운 근육통은 오늘 자극이 제대로 들어갔다는 증거예요. 바디프로필로 가는 첫 번째 로그입니다.",
    hard: "오늘 힘드셨던 만큼 몸이 바뀝니다. 강도는 매 주차 데이터 보고 조정하니 무리 없이 갑니다.",
  }[state.mood];

  const musc = state.stimulus.length
    ? state.stimulus.join(" · ")
    : "하체 전반";

  return [
    {
      tag: "몸의 증거",
      icon: Flame,
      line: `오늘 ${musc}에 자극이 정확히 들어갔어요. ${kneeLine}`,
    },
    {
      tag: "논리 연결",
      icon: TrendingUp,
      line: `${moodLine} 감이 아니라, 오늘 측정한 인바디·가동성 수치가 근거예요.`,
    },
    {
      tag: "등록 제안",
      icon: Handshake,
      line: `오늘 측정값 + 방금 몸으로 느낀 자극 = 검증 끝. 남은 건 12주 역산뿐이에요. '${pkg.name}' ${pkg.sessions}회면 바디프로필 데드라인에 정확히 도착합니다. 판단은 데이터 보고 하세요.`,
    },
  ];
}

/* ---- 상황별 즉효 스트레칭 & 기능성 운동 (기구 루틴 보완) ---- */
const MOBILITY_CATS = {
  desk: { label: "좌식 해소", icon: Armchair, color: "sky" },
  knee: { label: "무릎 안정", icon: Footprints, color: "orange" },
  activation: { label: "즉효 활성", icon: Zap, color: "lime" },
};

const MOBILITY = [
  {
    id: "m1",
    cat: "desk",
    name: "하프닐링 힙 플렉서 스트레칭",
    equip: "맨몸",
    dose: "30초 × 좌우 2회",
    effect: "단축된 장요근 이완 → 골반 전방경사·무릎 앞쪽 당김이 즉시 풀림",
    cue: "반무릎 자세에서 뒷다리 쪽 엉덩이를 앞으로, 골반은 뒤로 말아 유지.",
  },
  {
    id: "m2",
    cat: "desk",
    name: "오픈북 흉추 회전",
    equip: "맨몸",
    dose: "8회 × 좌우",
    effect: "라운드 숄더 완화 → 상체 회전·호흡이 그 자리에서 트임",
    cue: "옆으로 누워 무릎 고정, 위쪽 팔을 크게 펼쳐 가슴을 천장으로.",
  },
  {
    id: "m3",
    cat: "knee",
    name: "무릎-벽 발목 가동성 (도살플렉션)",
    equip: "벽",
    dose: "10회 × 좌우",
    effect: "발목 가동범위 확보 → 스쿼트 시 무릎 전방 부하가 분산됨",
    cue: "발끝 벽에서 한 뼘, 무릎으로 벽 터치. 뒤꿈치 떨어지지 않게.",
  },
  {
    id: "m4",
    cat: "knee",
    name: "밴드 클램쉘",
    equip: "미니밴드",
    dose: "15회 × 3 좌우",
    effect: "중둔근 즉시 활성 → 무릎 안쪽 무너짐(밸구스) 억제",
    cue: "옆으로 누워 무릎에 밴드, 발 붙인 채 위 무릎만 조개처럼 벌리기.",
  },
  {
    id: "m5",
    cat: "knee",
    name: "터미널 니 익스텐션 (TKE)",
    equip: "미니밴드",
    dose: "15회 × 3",
    effect: "내측광근(VMO) 활성 → 슬개골 정렬·무릎 안정성 즉각 향상",
    cue: "밴드를 무릎 뒤에 걸고, 무릎을 끝까지 펴며 허벅지 안쪽에 힘.",
  },
  {
    id: "m6",
    cat: "activation",
    name: "90/90 힙 스위치",
    equip: "맨몸",
    dose: "8회 × 좌우",
    effect: "고관절 내·외회전 가동성 확보 → 하체 운동 전 즉효 워밍업",
    cue: "앉아서 양 무릎 90도, 좌우로 무릎 눕히며 골반 회전.",
  },
  {
    id: "m7",
    cat: "activation",
    name: "글루트 브리지 마치",
    equip: "맨몸",
    dose: "10회 × 2",
    effect: "둔근·코어 점화 → 하체 세션 직전 신경 활성으로 자극 효율↑",
    cue: "브리지 상태 유지하며 무릎 번갈아 들기, 골반 수평 유지.",
  },
];

/* ---- 탭 메타 ---- */
const TABS = [
  { id: 0, label: "회원" },
  { id: 1, label: "1차 OT" },
  { id: 2, label: "2차 OT" },
  { id: 3, label: "재등록 CRM" },
  { id: 4, label: "음성일지" },
];

/* =========================================================================
   TAB 2 DATA  —  2차 OT (피드백 분석 + 둔근 100% 루틴)
   ========================================================================= */

const RAW_FEEDBACK =
  "무릎은 하나도 안 아파서 신기했는데, 엉덩이(둔근)에 자극이 잘 안 오고 허벅지 앞쪽만 힘이 들어가는 느낌이었어요.";

const FEEDBACK_ANALYSIS = {
  headline: "대퇴사두 우세 + 둔근 신경 활성 미흡",
  cause: [
    {
      t: "골반 전방경사",
      d: "좌식 근무로 장요근이 단축 → 골반이 앞으로 기울며 둔근이 늘어난 채 약화(신장성 약화).",
    },
    {
      t: "대퇴사두 우세 (Quad-dominant)",
      d: "하체 동작에서 앞허벅지가 먼저 동원 → 둔근이 개입할 타이밍을 빼앗김.",
    },
    {
      t: "둔근 신경 지연",
      d: "평소 미사용으로 둔근 점화 신호가 느림 → '자극이 안 온다'는 체감의 실체.",
    },
  ],
  win: "무릎 통증 0 = 1차 우회 세팅은 성공. 2차 과제는 '대퇴사두 차단 → 둔근 단독 자극' 재교육.",
};

const ADJUST_TIPS = [
  {
    icon: Gauge,
    t: "상체 각도",
    d: "상체를 15° 앞으로 힙힌지 → 대둔근 상부·중둔근 개입↑, 대퇴근막장근(TFL) 개입↓.",
  },
  {
    icon: ShieldCheck,
    t: "골반 고정",
    d: "반대손으로 패드 고정, 코어로 골반 회전 차단 → 허리·허벅지 보상 제거.",
  },
  {
    icon: Footprints,
    t: "발끝 방향",
    d: "발끝 살짝 안쪽(내회전) → 중둔근 타겟. 바깥으로 벌어지면 TFL이 자극을 훔쳐감.",
  },
  {
    icon: Repeat,
    t: "템포",
    d: "벌릴 때 2초 · 끝 정지 1초 · 복귀 3초. 신장성 구간을 늘려 둔근 긴장 시간 확보.",
  },
];

const ROUTINE_2 = [
  {
    id: "a1",
    name: "밴드 클램쉘 (사전 활성)",
    machine: "미니밴드",
    sets: "20회 × 2",
    tip: "머신 들어가기 전에 둔근 신경부터 깨우기.",
    muscles: ["중둔근"],
  },
  {
    id: "a2",
    name: "Gym80 아웃싸이 · 전경사 세팅",
    machine: "Gym80",
    sets: "15회 × 4",
    tip: "상체 15° 숙이고 발끝 안쪽, 골반 고정. 앞허벅지 힘 빠지는 지점을 찾기.",
    muscles: ["중둔근", "대둔근"],
  },
  {
    id: "a3",
    name: "Gym80 아웃싸이 · 끝범위 홀드",
    machine: "Gym80",
    sets: "12회 × 3",
    tip: "최대 외전 지점에서 2초 정지. 둔근 등척성 자극 극대화.",
    muscles: ["중둔근"],
  },
  {
    id: "a4",
    name: "글루트 브리지 마치 (마무리)",
    machine: "맨몸",
    sets: "20회 × 3",
    tip: "앞허벅지 아닌 엉덩이로 밀어 올리는 감각으로 마감.",
    muscles: ["대둔근", "코어"],
  },
];

const SECOND_ACT = [
  { id: "yes", label: "엉덩이 자극 왔다", tone: "lime" },
  { id: "partial", label: "조금 왔다", tone: "orange" },
  { id: "no", label: "아직 안 옴", tone: "red" },
];

/* 오늘 둔근 활성 결과 → 2차 세일즈 흐름 조립 (1차 연결 → 증명 → 클로징) */
function buildSecondSales(act) {
  const proof = {
    yes: "지금 엉덩이에 딱 오죠? 같은 Gym80인데 세팅만 바꾼 거예요. 몸이 바로 반응했어요.",
    partial:
      "아까보단 엉덩이에 오시죠? 아직 100%는 아니지만 방향은 확실히 잡혔어요. 반복하면 완전히 옵니다.",
    no: "아직 잘 안 오시는군요. 신경 활성이 더뎌서 그래요 — 오히려 PT가 필요하다는 확실한 신호예요.",
  }[act];

  const close = {
    yes: "오늘 이 감각, 혼자선 다시 찾기 어려워요. 이 세팅을 몸에 새기는 게 앞으로의 과제예요. 계속 옆에서 잡아드릴게요.",
    partial:
      "오늘 방향을 잡았으니, 이걸 몸에 정착시키는 데 몇 세션이 필요해요. 짧게라도 이어서 확실히 마무리하죠.",
    no: "혼자 하면 계속 앞허벅지만 쓰게 돼요. 이 패턴 교정은 옆에서 봐줘야 잡힙니다. 그래서 다음 세션이 중요해요.",
  }[act];

  return [
    {
      n: "01",
      stage: "1차 소환",
      icon: MessageSquareQuote,
      tone: "담담하게, 기록을 짚듯",
      when: "2차 워밍업 중",
      line:
        "철수님, 지난 1차 때 '무릎은 괜찮은데 엉덩이 자극이 안 온다'고 하셨죠. 오늘은 그 원인부터 잡고 갑니다.",
    },
    {
      n: "02",
      stage: "원인 공유",
      icon: Microscope,
      tone: "논리적으로, 브리핑하듯",
      when: "사전 활성 직전",
      line:
        "앞허벅지가 먼저 일하는 패턴이었어요. 그래서 오늘은 상체 각도랑 골반을 고정해서 엉덩이만 일하게 세팅합니다.",
    },
    {
      n: "03",
      stage: "실시간 증명",
      icon: Flame,
      tone: "확신 있게, 살짝 텐션",
      when: "Gym80 전경사 세트 직후",
      line: proof,
      adaptive: true,
    },
    {
      n: "04",
      stage: "차이 각인",
      icon: Brain,
      tone: "차분하게 못 박듯",
      when: "세트 사이 휴식",
      line:
        "이 차이는 운이 아니에요. 지난주 데이터로 원인을 찾아 세팅 하나를 바꾼 결과예요. 감으로 운동하면 안 나오는 반응이에요.",
    },
    {
      n: "05",
      stage: "결과 예고",
      icon: TrendingUp,
      tone: "신뢰감 있게, 그림 그려주듯",
      when: "마무리 운동 중",
      line:
        "매 세션 이렇게 안 되는 부위를 진단하고 고쳐나가면, 바디프로필까지 군살 없이 갑니다.",
    },
    {
      n: "06",
      stage: "클로징",
      icon: Handshake,
      tone: "담백하게, 압박 없이",
      when: "운동 종료 후 브리핑",
      line: close,
      adaptive: true,
    },
  ];
}

/* =========================================================================
   TAB 3 DATA  —  라이프사이클 CRM (재등록 전략)
   ========================================================================= */

const CRM_SIGNALS = [
  { k: "목적", v: "바디프로필", tone: "lime" },
  { k: "이벤트", v: "가을 결혼 예정", tone: "sky" },
  { k: "재정", v: "부담 인지", tone: "orange" },
  { k: "성향", v: "ISTJ", tone: "sky" },
  { k: "1차 결과", v: "무릎 통증 우회 성공", tone: "lime" },
];

const CRM_PSYCH =
  "동기는 오히려 강해졌습니다(결혼 → 바디프로필 니즈 강화). 다만 재정 부담이 '큰 결제 회피' 심리를 만들어, 만기 시 대형 패키지를 들이밀면 이탈 위험이 급상승합니다.";

const CRM_RISK = [
  "만기 시 30회 등 대형 결제 압박 → 부담 회피로 미등록·이탈.",
  "결혼 준비 스트레스와 지출이 겹쳐 '지금은 무리'라는 방어 심리 활성.",
];

const CRM_OPP = [
  "결혼이라는 명확한 데드라인 존재 → 짧고 저부담 패키지면 재등록 확률↑.",
  "결혼 준비 스트레스를 케어해주면 신뢰 레버가 강하게 작동.",
  "ISTJ 특성상 '필요 최소량'을 수치로 제시하면 합리적 결정으로 수용.",
];

const CRM_OFFER = {
  name: "단기 연장 · 결혼 스퍼트",
  sessions: 10,
  plan: "2개월 분납",
  perSession: 65000,
  total: 650000,
  monthly: 325000,
};

const CRM_SCRIPT = [
  {
    n: "01",
    tag: "결과 리뷰",
    icon: TrendingUp,
    tone: "담담하게, 데이터로",
    when: "잔여 6~8회 시점",
    line:
      "지금 8주차 인바디 보시면 체지방이 눈에 띄게 빠졌어요. 이 곡선 그대로면 예식날 목표에 도달합니다.",
  },
  {
    n: "02",
    tag: "데드라인 상기",
    icon: CalendarDays,
    tone: "차분하게, 사실만",
    when: "결과 공유 직후",
    line:
      "예식까지 남은 기간 세보면, 지금 페이스 유지가 관건이에요. 잔여 세션만으론 살짝 빠듯합니다.",
  },
  {
    n: "03",
    tag: "스트레스 케어",
    icon: Heart,
    tone: "공감하며, 부드럽게",
    when: "제안 전 분위기 조성",
    line:
      "결혼 준비에 돈 들어갈 데 많으신 거 압니다. 그래서 큰 결제 권하는 거 아니에요.",
  },
  {
    n: "04",
    tag: "최소 필요량 (역산)",
    icon: Target,
    tone: "논리적으로, 브리핑하듯",
    when: "제안 시작",
    line:
      "예식날 컨디션을 피크로 맞추는 데 딱 10회. 주 2회 × 남은 주수로 계산한 최소량이에요.",
  },
  {
    n: "05",
    tag: "분납 제안",
    icon: CreditCard,
    tone: "담백하게",
    when: "부담 해소",
    line:
      "10회를 2개월 분납으로 나누면 월 32.5만. 결혼 지출이랑 안 겹치게 결제 시점도 맞춰드릴게요.",
  },
  {
    n: "06",
    tag: "클로징",
    icon: Handshake,
    tone: "압박 없이, 결정권은 회원에게",
    when: "운동 종료 후 브리핑",
    line:
      "지금 연장하면 예식날 컨디션이 보장돼요. 무리한 투자 아니에요. 숫자 보시고 편하게 결정하세요.",
  },
];

const RESIGN_DIRECTION = [
  "압박이 아니라 '계획'으로 — 만기 강매 대신 예식 역산 스케줄로 접근.",
  "크기가 아니라 '최소 필요량' — 30회가 아닌 딱 필요한 10회 + 분납으로 저항 최소화.",
  "감정이 아니라 '데이터'로 — ISTJ는 수치·역산 근거를 줄 때 스스로 납득하고 등록.",
];

const RESIGN_TIMING = {
  total: 24,
  windowStart: 16,
  windowEnd: 20,
  reasons: [
    { t: "결과 가시화", d: "12주 중 8주차 전후 → 인바디 변화가 수치로 잡혀 설득 근거가 생김." },
    { t: "심리적 여유", d: "만기 임박 전이라 '쫓기는 결제'가 아닌 '계획된 연장'으로 프레이밍 가능." },
    { t: "데드라인 역산", d: "예식까지 남은 주수와 잔여 세션이 맞물려 '지금 연장' 논리가 자연스러움." },
    { t: "감정 고점", d: "운동 직후 만족도가 높을 때 대화를 열되, 결제 근거는 데이터로 마무리." },
  ],
  avoid: ["만기 당일 대형 결제 강요", "컨디션·기분 안 좋은 날", "결혼 지출이 몰리는 시기"],
};

function timingStatus(done, T) {
  const remain = T.total - done;
  if (done >= T.total)
    return {
      label: "만기 도달",
      tone: "red",
      msg: "재등록보다 재방문 리마인드·복귀 혜택 전략으로 전환.",
    };
  if (done > T.windowEnd)
    return {
      label: "마감 임박",
      tone: "orange",
      msg: `잔여 ${remain}회. 지금 바로 클로징 + 분납 카드로 이탈 방지.`,
    };
  if (done >= T.windowStart)
    return {
      label: "최적 윈도우",
      tone: "lime",
      msg: `잔여 ${remain}회. 결과 브리핑 + 연장 제안의 골든타임.`,
    };
  if (done >= T.total * 0.5)
    return {
      label: "예열 구간",
      tone: "sky",
      msg: "결과 씨앗 심기 — 인바디 변화만 각인하고, 제안은 아직 이르다.",
    };
  return {
    label: "관계 형성기",
    tone: "zinc",
    msg: "세일즈보다 신뢰·운동 습관 정착에 집중할 시기.",
  };
}

/* =========================================================================
   PURGE-SAFE COLOR TOKENS
   ========================================================================= */

const C = {
  sky: {
    text: "text-sky-400",
    soft: "bg-sky-500/10",
    border: "border-sky-500/30",
    ring: "ring-sky-500/50",
    dot: "bg-sky-400",
    bar: "bg-sky-400",
    glow: "shadow-sky-500/20",
  },
  lime: {
    text: "text-lime-400",
    soft: "bg-lime-500/10",
    border: "border-lime-500/30",
    ring: "ring-lime-500/50",
    dot: "bg-lime-400",
    bar: "bg-lime-400",
    glow: "shadow-lime-500/20",
  },
  orange: {
    text: "text-orange-400",
    soft: "bg-orange-500/10",
    border: "border-orange-500/30",
    ring: "ring-orange-500/50",
    dot: "bg-orange-400",
    bar: "bg-orange-400",
    glow: "shadow-orange-500/20",
  },
  emerald: {
    text: "text-emerald-400",
    soft: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/50",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    glow: "shadow-emerald-500/20",
  },
};

/* =========================================================================
   SMALL PIECES
   ========================================================================= */

function Chip({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="text-sm font-medium text-zinc-100">{value}</div>
      </div>
    </div>
  );
}

/* =========================================================================
   TAB 2  —  2차 OT 내비게이터
   ========================================================================= */

function SecondOTTab() {
  const [act, setAct] = useState("yes");
  const flow = buildSecondSales(act);

  const actCls = (tone, on) => {
    if (!on) return "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700";
    return {
      lime: "border-lime-500/40 bg-lime-500/10 text-lime-400",
      orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
      red: "border-red-500/40 bg-red-500/10 text-red-400",
    }[tone];
  };

  return (
    <div className="space-y-8">
      {/* 피드백 분석 카드 */}
      <section>
        <Eyebrow icon={Microscope}>회원 피드백 AI 분석</Eyebrow>

        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
          {/* 날것의 피드백 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <MessageSquareQuote className="h-3.5 w-3.5" /> 1차 OT 직후 · 회원의 말
            </div>
            <p className="text-sm italic leading-relaxed text-zinc-200">
              “{RAW_FEEDBACK}”
            </p>
          </div>

          {/* AI 진단 헤드라인 */}
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-md bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-400">
              AI 진단
            </span>
            <span className="text-sm font-semibold text-zinc-100">
              {FEEDBACK_ANALYSIS.headline}
            </span>
          </div>

          {/* 원인 3가지 */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {FEEDBACK_ANALYSIS.cause.map((c, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-orange-400">
                    0{i + 1}
                  </span>
                  <span className="text-sm font-semibold text-zinc-100">{c.t}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{c.d}</p>
              </div>
            ))}
          </div>

          {/* 결론 */}
          <div className="mt-4 flex gap-2 rounded-xl border border-lime-500/20 bg-lime-500/5 p-3.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
            <p className="text-sm leading-relaxed text-zinc-200">{FEEDBACK_ANALYSIS.win}</p>
          </div>
        </div>
      </section>

      {/* 조정 팁 + 2차 루틴 */}
      <section>
        <Eyebrow icon={Target}>둔근 100% · 조정 팁 & 2차 루틴</Eyebrow>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* 핵심 조정 팁 */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Gym80 아웃싸이 · 대퇴사두 차단 세팅
            </div>
            <div className="space-y-2.5">
              {ADJUST_TIPS.map((tip) => {
                const Icon = tip.icon;
                return (
                  <div key={tip.t} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10">
                      <Icon className="h-4 w-4 text-orange-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{tip.t}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{tip.d}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2차 루틴 카드 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
            {ROUTINE_2.map((r) => (
              <div
                key={r.id}
                className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-zinc-100">{r.name}</h4>
                  <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                    {r.machine}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">
                  <span className="text-orange-400">◆</span> {r.tip}
                </p>
                <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-2">
                  <span className="font-mono text-xs font-semibold text-lime-400">
                    {r.sets}
                  </span>
                  <span className="text-zinc-700">·</span>
                  <div className="flex flex-wrap gap-1">
                    {r.muscles.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      >
                        #{m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2차 세일즈 흐름 */}
      <section>
        <Eyebrow icon={Handshake}>
          2차 세일즈 흐름 · 1차 연결 → 실시간 증명 → 클로징
        </Eyebrow>

        {/* 오늘 결과 토글 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">오늘 둔근 자극 결과:</span>
          {SECOND_ACT.map((o) => (
            <button
              key={o.id}
              onClick={() => setAct(o.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${actCls(
                o.tone,
                act === o.id
              )}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* 대화 흐름 타임라인 */}
        <div className="space-y-2.5">
          {flow.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.n}
                className={`flex gap-3 rounded-xl border p-4 ${
                  step.adaptive
                    ? "border-lime-500/30 bg-lime-500/5"
                    : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                <div className="flex shrink-0 flex-col items-center">
                  <span className="font-mono text-xs font-bold text-lime-400">
                    {step.n}
                  </span>
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950">
                    <Icon className="h-4 w-4 text-lime-400" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">
                      {step.stage}
                    </span>
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">
                      🗣 {step.tone}
                    </span>
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-500">
                      ⏱ {step.when}
                    </span>
                    {step.adaptive && (
                      <span className="rounded-md bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-400">
                        상황 연동
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                    “{step.line}”
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
          핵심은 '말'이 아니라 '몸의 변화'로 파는 흐름입니다. 1차 불만 → 원인 진단 →
          같은 기구·다른 세팅으로 실시간 증명 → 차이를 데이터로 각인하는 순서가 ISTJ에게
          가장 잘 먹힙니다.
        </p>
      </section>
    </div>
  );
}

/* =========================================================================
   TAB 3  —  라이프사이클 CRM (재등록 전략)
   ========================================================================= */

function CRMTab() {
  const [sessDone, setSessDone] = useState(18);
  const status = timingStatus(sessDone, RESIGN_TIMING);
  const toneCls = (tone) =>
    ({
      lime: "text-lime-400 border-lime-500/40 bg-lime-500/10",
      orange: "text-orange-400 border-orange-500/40 bg-orange-500/10",
      sky: "text-sky-400 border-sky-500/40 bg-sky-500/10",
      red: "text-red-400 border-red-500/40 bg-red-500/10",
      zinc: "text-zinc-300 border-zinc-700 bg-zinc-800/60",
    }[tone]);

  const pct = (n) => (n / RESIGN_TIMING.total) * 100;

  return (
    <div className="space-y-8">
      {/* Risk & Opportunity */}
      <section>
        <Eyebrow icon={Brain}>리스크 & 기회 분석</Eyebrow>

        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
          {/* 시그널 칩 */}
          <div className="flex flex-wrap gap-2">
            {CRM_SIGNALS.map((s) => {
              const c = C[s.tone];
              return (
                <div
                  key={s.k}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${c.border} ${c.soft}`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {s.k}
                  </span>
                  <span className={`text-xs font-semibold ${c.text}`}>{s.v}</span>
                </div>
              );
            })}
          </div>

          {/* 심리 요약 */}
          <div className="mt-4 flex gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                심리 상태 진단
              </div>
              <p className="text-sm leading-relaxed text-zinc-200">{CRM_PSYCH}</p>
            </div>
          </div>

          {/* Risk / Opportunity 2열 */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400">
                <AlertTriangle className="h-4 w-4" /> 이탈 리스크
              </div>
              <ul className="space-y-2">
                {CRM_RISK.map((r, i) => (
                  <li key={i} className="text-xs leading-relaxed text-zinc-300">
                    · {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <Lightbulb className="h-4 w-4" /> 재등록 기회
              </div>
              <ul className="space-y-2">
                {CRM_OPP.map((o, i) => (
                  <li key={i} className="text-xs leading-relaxed text-zinc-300">
                    · {o}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 재등록 타이밍 */}
      <section>
        <Eyebrow icon={CalendarDays}>재등록 타이밍 · 잔여 세션으로 판정</Eyebrow>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          {/* 현재 상태 배지 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                진행 · 24회 패키지 기준
              </div>
              <div className="font-mono text-2xl font-bold text-zinc-50">
                {sessDone}
                <span className="text-base font-normal text-zinc-500">
                  {" "}
                  / {RESIGN_TIMING.total}회
                </span>
              </div>
            </div>
            <div
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${toneCls(
                status.tone
              )}`}
            >
              {status.label}
            </div>
          </div>

          {/* 게이지 */}
          <div className="mt-4">
            <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
              {/* 최적 윈도우 밴드 */}
              <div
                className="absolute inset-y-0 bg-lime-500/25"
                style={{
                  left: `${pct(RESIGN_TIMING.windowStart)}%`,
                  width: `${pct(
                    RESIGN_TIMING.windowEnd - RESIGN_TIMING.windowStart
                  )}%`,
                }}
              />
              {/* 진행 마커 */}
              <div
                className="absolute inset-y-0 w-1 rounded-full bg-lime-400"
                style={{ left: `calc(${pct(sessDone)}% - 2px)` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
              <span>0</span>
              <span className="text-lime-500">
                최적 {RESIGN_TIMING.windowStart}~{RESIGN_TIMING.windowEnd}회
              </span>
              <span>{RESIGN_TIMING.total}</span>
            </div>

            {/* 슬라이더 */}
            <input
              type="range"
              min={0}
              max={RESIGN_TIMING.total}
              value={sessDone}
              onChange={(e) => setSessDone(Number(e.target.value))}
              className="mt-3 w-full accent-lime-400"
              aria-label="완료 세션 수"
            />
          </div>

          {/* 판정 메시지 */}
          <div className={`mt-2 rounded-lg border px-3 py-2 text-sm ${toneCls(status.tone)}`}>
            {status.msg}
          </div>

          {/* 근거 + 피해야 할 타이밍 */}
          <div className="mt-4 grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                이 시점을 노리는 근거
              </div>
              <ul className="space-y-2">
                {RESIGN_TIMING.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-400" />
                    <span className="text-xs leading-relaxed text-zinc-400">
                      <span className="font-semibold text-zinc-200">{r.t}</span> — {r.d}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-red-400">
                피해야 할 타이밍
              </div>
              <ul className="space-y-2">
                {RESIGN_TIMING.avoid.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="text-xs leading-relaxed text-zinc-400">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 타겟 제안 + 대본 */}
      <section>
        <Eyebrow icon={Handshake}>재등록 세일즈 방향 & 흐름</Eyebrow>

        {/* 세일즈 방향 3원칙 */}
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {RESIGN_DIRECTION.map((d, i) => (
            <div
              key={i}
              className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-3"
            >
              <div className="font-mono text-xs font-bold text-lime-400">
                방향 0{i + 1}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">{d}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* 제안 패키지 카드 */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-lime-500/40 bg-lime-500/5 p-5 shadow-lg shadow-lime-500/10">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-lime-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                  추천 제안
                </span>
              </div>
              <div className="mt-2 text-lg font-bold text-zinc-50">{CRM_OFFER.name}</div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-mono text-2xl font-bold text-zinc-50">
                  {CRM_OFFER.sessions}
                </span>
                <span className="text-sm text-zinc-500">회 · {CRM_OFFER.plan}</span>
              </div>

              <div className="mt-4 space-y-1.5 border-t border-zinc-800 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">총액</span>
                  <span className="font-mono font-semibold text-zinc-200">
                    {won(CRM_OFFER.total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">회당</span>
                  <span className="font-mono text-zinc-300">{won(CRM_OFFER.perSession)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">월 부담 (분납)</span>
                  <span className="font-mono font-semibold text-lime-400">
                    {won(CRM_OFFER.monthly)}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
                대형 결제 대신 데드라인 맞춤 최소량 + 분납으로 심리적 저항을 낮춘 설계.
              </p>
            </div>
          </div>

          {/* 세일즈 흐름 (단계별 대본) */}
          <div className="space-y-2.5 lg:col-span-3">
            {CRM_SCRIPT.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.n}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-lime-400">
                      {s.n}
                    </span>
                    <Icon className="h-3.5 w-3.5 text-lime-400" />
                    <span className="text-sm font-semibold text-zinc-100">{s.tag}</span>
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400">
                      🗣 {s.tone}
                    </span>
                    <span className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-500">
                      ⏱ {s.when}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    “{s.line}”
                  </p>
                </div>
              );
            })}
            <p className="pt-1 text-[10px] leading-relaxed text-zinc-600">
              ※ 회원이 사석에서 언급한 개인사(결혼·재정)는 민감 정보입니다. 상담에 활용하기
              전 회원 동의·기록 관리 원칙을 팀 차원에서 정해두는 걸 권장해요.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =========================================================================
   신규 회원 사전 정보 등록 폼 (모달)
   ========================================================================= */

function MemberForm({ machineOptions, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    job: "",
    residence: "",
    mbti: "",
    pain: "",
    goal: "",
  });
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleMachine = (label) =>
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));

  const save = async () => {
    if (!form.name.trim()) {
      setErr("이름은 필수입니다.");
      return;
    }
    if (!supabase) {
      setErr("Supabase가 아직 설정되지 않았어요. .env.local의 키를 확인하세요.");
      return;
    }
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("user_table").insert({
      name: form.name.trim(),
      age: form.age ? Number(form.age) : null,
      job: form.job || null,
      residence: form.residence || null,
      mbti: form.mbti || null,
      pain: form.pain || null,
      goal: form.goal || null,
      machines: picked,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved();
  };

  const fields = [
    { k: "name", label: "이름", ph: "김철수" },
    { k: "age", label: "나이", ph: "34", type: "number" },
    { k: "job", label: "직업", ph: "IT 개발자" },
    { k: "residence", label: "거주지", ph: "센터 인근 오피스텔" },
    { k: "mbti", label: "MBTI", ph: "ISTJ" },
    { k: "pain", label: "불편 부위", ph: "우측 무릎 통증" },
    { k: "goal", label: "목적", ph: "바디프로필" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-lime-400" />
            <h2 className="text-base font-semibold text-zinc-100">신규 회원 사전 정보 등록</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.k} className={f.k === "name" ? "col-span-2" : ""}>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                {f.label}
                {f.k === "name" && <span className="text-lime-400"> *</span>}
              </label>
              <input
                type={f.type || "text"}
                value={form[f.k]}
                onChange={set(f.k)}
                placeholder={f.ph}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
              />
            </div>
          ))}
        </div>

        {/* 보유머신 */}
        <div className="mt-3">
          <label className="mb-1.5 block text-[11px] font-medium text-zinc-500">
            보유머신 {machineOptions.length === 0 && "(center_machine 시드 필요)"}
          </label>
          <div className="flex flex-wrap gap-2">
            {machineOptions.map((label) => {
              const on = picked.includes(label);
              return (
                <button
                  key={label}
                  onClick={() => toggleMachine(label)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-lime-500/40 bg-lime-500/10 text-lime-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {err}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-700"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition active:scale-95 disabled:opacity-60"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   회원 목록 (전용 탭)
   ========================================================================= */

function MemberListTab({ members, selectedId, onSelect, onAdd }) {
  const [q, setQ] = useState("");
  const list = q.trim()
    ? members.filter((m) =>
        `${m.name} ${m.job}`.toLowerCase().includes(q.trim().toLowerCase())
      )
    : members;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회원 검색 (이름·직업)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
          />
        </div>
        <button
          onClick={onAdd}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 transition active:scale-95"
        >
          <UserPlus className="h-4 w-4" /> 등록
        </button>
      </div>

      <div className="mb-3 text-xs text-zinc-500">전체 {members.length}명</div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
          <User className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-400">
            {members.length === 0
              ? "아직 등록된 회원이 없어요."
              : "검색 결과가 없어요."}
          </p>
          {members.length === 0 && (
            <button
              onClick={onAdd}
              className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:border-lime-500/50"
            >
              첫 회원 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => {
            const on = m.id === selectedId;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  on
                    ? "border-lime-500/40 bg-lime-500/5"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-bold text-lime-400">
                  {m.name ? m.name.slice(0, 1) : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{m.name}</span>
                    <span className="font-mono text-xs text-zinc-500">{m.age}세</span>
                    {on && (
                      <span className="rounded bg-lime-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-400">
                        선택됨
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-400">{m.job}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {m.mbti}
                    </span>
                    <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {m.pain}
                    </span>
                    <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      목표 {m.goal}
                    </span>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-600 group-hover:text-lime-400" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   MAIN
   ========================================================================= */

export default function OTNavigatorDashboard() {
  const [tab, setTab] = useState(1);

  // --- Supabase 연동 상태 ---
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [machineOptions, setMachineOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [dbNote, setDbNote] = useState("");

  const loadMembers = async () => {
    if (!supabase) {
      setDbNote("데모 모드 — Supabase 키를 설정하면 실데이터가 연결됩니다.");
      return;
    }
    const { data, error } = await supabase
      .from("user_table")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setDbNote("불러오기 실패: " + error.message);
      return;
    }
    const mapped = (data || []).map(mapMemberRow);
    setMembers(mapped);
    setDbNote("");
    setSelectedId((prev) => prev ?? (mapped[0] ? mapped[0].id : null));
  };

  const loadMachines = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("center_machine").select("*");
    setMachineOptions((data || []).map((m) => `${m.brand} ${m.name}`));
  };

  useEffect(() => {
    loadMembers();
    loadMachines();
  }, []);

  // DB 회원이 있으면 선택된 회원을, 없으면 데모 회원을 렌더
  const member =
    members.find((m) => m.id === selectedId) || members[0] || DEMO_MEMBER;

  const [activeId, setActiveId] = useState("assess");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(() => new Set());
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState([]);

  // 클로징 빌더 — 운동 직후 상태
  const [stimulus, setStimulus] = useState(["둔근", "중둔근"]);
  const [knee, setKnee] = useState("down");
  const [mood, setMood] = useState("good");

  const recommended = PACKAGES.find((p) => p.recommended);
  const closing = buildClosing({ stimulus, knee, mood }, recommended);

  const toggleStimulus = (m) =>
    setStimulus((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );

  // 상황별 즉효 운동 필터
  const [mobFilter, setMobFilter] = useState("all");
  const mobList =
    mobFilter === "all"
      ? MOBILITY
      : MOBILITY.filter((m) => m.cat === mobFilter);

  const active = PHASES.find((p) => p.id === activeId);
  const cap = active.duration * 60;
  const progress = Math.min(elapsed / cap, 1);
  const overtime = elapsed > cap;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const selectPhase = (id) => {
    setActiveId(id);
    setElapsed(0);
    setRunning(true);
  };

  const toggleRoutine = (id) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addNote = () => {
    const v = note.trim();
    if (!v) return;
    setNotes((n) => [{ id: Date.now(), text: v }, ...n].slice(0, 12));
    setNote("");
  };

  return (
    <div className="min-h-screen bg-zinc-950 pb-28 text-zinc-100 antialiased selection:bg-lime-400/30">
      {/* ================= TOP BAR ================= */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-lime-400 to-emerald-500 shadow-lg shadow-lime-500/30">
                <Activity className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-400">
                  OT Navigator
                </div>
                <div className="text-sm font-semibold text-zinc-100">
                  {member.name}
                  <span className="font-normal text-zinc-500"> · 세일즈 네비게이터</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {members.length > 0 && (
                <select
                  value={selectedId || ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="max-w-[110px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-lime-500/50 sm:max-w-[130px]"
                  aria-label="회원 선택"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-lime-500/50 hover:text-lime-400 active:scale-95"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">신규 등록</span>
              </button>

              <a
                href="/admin"
                className="flex items-center gap-1.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-300 transition hover:border-fuchsia-500/60 active:scale-95"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">관리자</span>
              </a>

              {tab === 1 && (
                <>
                  <div className="hidden text-right sm:block">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {active.n} · {active.title.split(" ")[0]}
                    </div>
                    <div
                      className={`font-mono text-sm font-semibold ${
                        overtime ? "text-red-400" : C[active.color].text
                      }`}
                    >
                      {fmt(elapsed)}{" "}
                      <span className="text-zinc-600">/ {active.duration}:00</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setRunning((r) => !r)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:border-lime-500/50 hover:text-lime-400 active:scale-95"
                    aria-label={running ? "타이머 일시정지" : "타이머 시작"}
                  >
                    {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 탭 네비게이션 */}
          <nav className="-mb-px flex gap-1 overflow-x-auto whitespace-nowrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${
                  tab === t.id ? "text-lime-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-lime-400" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {dbNote && (
        <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-400">
            {dbNote}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {tab === 0 && (
          <MemberListTab
            members={members}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setTab(1);
            }}
            onAdd={() => setShowForm(true)}
          />
        )}

        {tab === 1 && (
          <>
            {/* ================= HERO ================= */}
        <section className="mb-6">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-lime-400">
                    {member.session} · LIVE
                  </span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
                  {member.name}
                  <span className="ml-2 font-mono text-lg font-normal text-zinc-500">
                    {member.age}세
                  </span>
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {member.job} · 목표{" "}
                  <span className="font-semibold text-lime-400">{member.goal}</span>
                </p>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
                <Chip icon={MapPin} label="거주" value={member.residence} />
                <Chip icon={Brain} label="MBTI" value={member.mbti} />
                <Chip icon={Briefcase} label="직업" value={member.job} />
                <Chip icon={Activity} label="불편 부위" value={member.pain} />
              </div>
            </div>

            {/* 성향 3줄 요약 */}
            <div className="relative mt-5 border-t border-zinc-800 pt-5">
              <Eyebrow icon={Brain}>개발자 맞춤 성향 분석</Eyebrow>
              <ul className="space-y-2.5">
                {member.summary.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs font-semibold text-lime-400">
                      0{i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-zinc-300">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ================= GRID ================= */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ---- TIMELINE (signature) ---- */}
          <section className="lg:col-span-3">
            <Eyebrow icon={Clock}>60분 OT 타임라인 — 탭하면 타이머 시작</Eyebrow>

            <div className="relative">
              {/* rail */}
              <div className="absolute bottom-2 left-[22px] top-2 w-px bg-zinc-800" />

              <div className="space-y-3">
                {PHASES.map((p) => {
                  const isActive = p.id === activeId;
                  const c = C[p.color];
                  const Icon = p.icon;
                  const pct = isActive ? Math.round(progress * 100) : 0;

                  return (
                    <button
                      key={p.id}
                      onClick={() => selectPhase(p.id)}
                      className={`group relative flex w-full gap-4 rounded-xl border p-4 text-left transition ${
                        isActive
                          ? `${c.border} ${c.soft} shadow-lg ${c.glow}`
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                      }`}
                    >
                      {/* node */}
                      <div className="relative z-10 shrink-0">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                            isActive
                              ? `${c.border} ${c.soft} ring-4 ${c.ring}`
                              : "border-zinc-700 bg-zinc-950"
                          }`}
                        >
                          <Icon
                            className={`h-5 w-5 ${isActive ? c.text : "text-zinc-500"}`}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`font-mono text-xs font-bold ${
                                isActive ? c.text : "text-zinc-600"
                              }`}
                            >
                              {p.n}
                            </span>
                            <h3 className="truncate text-sm font-semibold text-zinc-100">
                              {p.title}
                            </h3>
                          </div>
                          <span className="shrink-0 font-mono text-xs text-zinc-500">
                            {p.range}
                          </span>
                        </div>

                        {/* goals */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.goals.map((g) => (
                            <span
                              key={g}
                              className="rounded-md bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-400"
                            >
                              {g}
                            </span>
                          ))}
                        </div>

                        {/* live progress */}
                        {isActive && (
                          <div className="mt-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  overtime ? "bg-red-400" : c.bar
                                }`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span
                                className={`font-mono text-xs font-semibold ${
                                  overtime ? "text-red-400" : c.text
                                }`}
                              >
                                {fmt(elapsed)}
                                {overtime && " · 초과"}
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                                {running ? "진행 중" : "일시정지"}
                                <ChevronRight className="h-3 w-3" />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- RIGHT COLUMN ---- */}
          <div className="space-y-6 lg:col-span-2">
            {/* SALES SCRIPT */}
            <section>
              <Eyebrow icon={MessageSquareQuote}>ISTJ 공략 · 데이터 기반 대본</Eyebrow>
              <div className="space-y-2.5">
                {SALES_SCRIPT.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.tag}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 transition hover:border-zinc-700"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-lime-400" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                          {s.tag}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-300">
                        “{s.line}”
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ROUTINE */}
            <section>
              <Eyebrow icon={Dumbbell}>무릎 우회 하체 루틴 · 기구 매칭</Eyebrow>
              <div className="space-y-2.5">
                {ROUTINE.map((r) => {
                  const isDone = done.has(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRoutine(r.id)}
                      className={`flex w-full gap-3 rounded-xl border p-3.5 text-left transition ${
                        isDone
                          ? "border-lime-500/30 bg-lime-500/5"
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-lime-400" />
                        ) : (
                          <Circle className="h-5 w-5 text-zinc-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4
                            className={`truncate text-sm font-semibold ${
                              isDone ? "text-zinc-500 line-through" : "text-zinc-100"
                            }`}
                          >
                            {r.name}
                          </h4>
                          <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                            {r.machine}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                          <span className="text-orange-400">◆</span> {r.safe}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-lime-400">
                            {r.sets}
                          </span>
                          <span className="text-zinc-700">·</span>
                          <div className="flex flex-wrap gap-1">
                            {r.muscles.map((m) => (
                              <span
                                key={m}
                                className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-400"
                              >
                                #{m}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* ================= 상황별 즉효 스트레칭 & 기능성 운동 ================= */}
        <section className="mt-8">
          <Eyebrow icon={Activity}>상황별 즉효 스트레칭 · 기능성 운동</Eyebrow>

          {/* 필터 칩 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-zinc-600" />
            <button
              onClick={() => setMobFilter("all")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                mobFilter === "all"
                  ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
              }`}
            >
              전체
            </button>
            {Object.entries(MOBILITY_CATS).map(([key, meta]) => {
              const on = mobFilter === key;
              const c = C[meta.color];
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  onClick={() => setMobFilter(key)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? `${c.border} ${c.soft} ${c.text}`
                      : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* 카드 그리드 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mobList.map((m) => {
              const meta = MOBILITY_CATS[m.cat];
              const c = C[meta.color];
              const Icon = meta.icon;
              return (
                <div
                  key={m.id}
                  className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 ${c.text}`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">
                        {meta.label}
                      </span>
                    </div>
                    <span className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                      {m.equip}
                    </span>
                  </div>

                  <h4 className="mt-2 text-sm font-semibold text-zinc-100">{m.name}</h4>

                  <div className={`mt-2 rounded-lg ${c.soft} px-2.5 py-2`}>
                    <p className={`text-[11px] font-medium leading-relaxed ${c.text}`}>
                      ⚡ {m.effect}
                    </p>
                  </div>

                  <p className="mt-2 flex-1 text-[11px] leading-relaxed text-zinc-400">
                    {m.cue}
                  </p>

                  <div className="mt-3 border-t border-zinc-800 pt-2 font-mono text-xs font-semibold text-zinc-300">
                    {m.dose}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
            ※ 일반적인 기능성·교정 운동 가이드입니다. 무릎에 날카롭거나 지속되는 통증,
            붓기가 있으면 운동을 멈추고 정형외과·물리치료 전문가 확인을 권하세요.
          </p>
        </section>

        {/* ================= 재정 추정 & 가격 제안 ================= */}
        <section className="mt-8">
          <Eyebrow icon={Wallet}>재정 추정 · PT 패키지 제안</Eyebrow>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* 추정 카드 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  추정 연 소득
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  {FINANCE.bracket}
                </span>
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-zinc-50">
                {FINANCE.estIncome}
              </div>
              <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
                {FINANCE.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                    <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
                ※ 직업·나이 기반 통계적 추정치이며 실제 상담 시 조정됩니다. 개인 금융정보가
                아닌 세일즈 참고용 지표입니다.
              </p>
            </div>

            {/* 패키지 3종 */}
            <div className="grid gap-3 sm:grid-cols-3 lg:col-span-3">
              {PACKAGES.map((p) => (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border p-4 ${
                    p.recommended
                      ? "border-lime-500/50 bg-lime-500/5 shadow-lg shadow-lime-500/10"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  {p.recommended && (
                    <span className="absolute -top-2.5 left-4 rounded-full bg-gradient-to-r from-lime-400 to-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-zinc-950">
                      추천
                    </span>
                  )}
                  <div className="text-sm font-semibold text-zinc-100">{p.name}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{p.weeks}</div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-mono text-xl font-bold text-zinc-50">
                      {p.sessions}
                    </span>
                    <span className="text-xs text-zinc-500">회</span>
                  </div>
                  <div
                    className={`mt-1 font-mono text-sm font-semibold ${
                      p.recommended ? "text-lime-400" : "text-zinc-300"
                    }`}
                  >
                    {won(p.total)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    회당 {won(p.perSession)}
                  </div>

                  <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-400">
                    {p.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 라이브 클로징 빌더 ================= */}
        <section className="mt-8">
          <Eyebrow icon={Sparkles}>라이브 클로징 빌더 · 운동 직후 상태 기반</Eyebrow>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* 상태 입력 */}
            <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Flame className="h-3.5 w-3.5 text-orange-400" /> 느낀 자극 부위
                </div>
                <div className="flex flex-wrap gap-2">
                  {STIMULUS.map((m) => {
                    const on = stimulus.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleStimulus(m)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          on
                            ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                            : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Heart className="h-3.5 w-3.5 text-sky-400" /> 무릎 상태
                </div>
                <div className="flex flex-wrap gap-2">
                  {KNEE.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKnee(k.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        knee === k.id
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
                  <Smile className="h-3.5 w-3.5 text-lime-400" /> 컨디션 · 기분
                </div>
                <div className="flex flex-wrap gap-2">
                  {MOOD.map((mo) => (
                    <button
                      key={mo.id}
                      onClick={() => setMood(mo.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        mood === mo.id
                          ? "border-lime-500/40 bg-lime-500/10 text-lime-400"
                          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      {mo.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 생성된 클로징 대본 */}
            <div className="space-y-2.5 lg:col-span-3">
              {closing.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.tag}
                    className="rounded-xl border border-lime-500/20 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-4"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-lime-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
                        {c.tag}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-200">“{c.line}”</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* logged notes */}
        {notes.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {notes.map((n) => (
              <span
                key={n.id}
                className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300"
              >
                {n.text}
              </span>
            ))}
          </div>
        )}
          </>
        )}

        {tab === 2 && <SecondOTTab />}
        {tab === 3 && <CRMTab />}
        {tab === 4 && <VoiceLogTab member={member} />}
      </main>

      {/* ================= MINIMAL QUICK-LOG BAR (Tab 1) ================= */}
      {tab === 1 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="현장 메모 빠르게 남기기…"
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-lime-500/50"
            />
            <button
              onClick={addNote}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 text-zinc-950 shadow-lg shadow-lime-500/30 transition active:scale-95"
              aria-label="메모 저장"
            >
              <Send className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* ================= 신규 회원 등록 모달 ================= */}
      {showForm && (
        <MemberForm
          machineOptions={machineOptions}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadMembers();
          }}
        />
      )}
    </div>
  );
}

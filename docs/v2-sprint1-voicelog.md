# v2 · 스프린트 1 — 음성일지 실 AI 연동

> 대상: Claude Code에 넘기는 구현 브리프
> 원칙(MASTERPLAN): "AI는 정답 제공이 아니라 스파링 파트너. 트레이너가 말한 걸 AI가 정제한다(0에서 창조 X → 헛소리 확률↓)."
> 이 슬라이스는 데이터 뼈대(`daily_workout_log`)가 이미 있어 선행 조건이 없는, v2 실 AI의 첫 수직 슬라이스다.

---

## 1. 목표

`VoiceLogTab`의 가짜 부분(마이크 미캡처 + `setTimeout` 데모 + `buildVoiceReport` 하드코딩)을
**진짜 마이크 녹음 → 실 STT → 실 AI 요약**으로 교체한다.
동시에 이 컴포넌트를 별도 파일로 분리해 v2 리팩터링의 첫 패턴을 만든다.

## 2. 완료 기준 (Acceptance Criteria)

- [ ] 실제 마이크로 녹음된다 (안드로이드 크롬 **및 iOS 사파리** 양쪽에서 동작).
- [ ] 녹음 종료 시 실제 한국어 STT 텍스트가 생성된다.
- [ ] STT 텍스트를 Claude가 리포트 형식(머신/피드백/홈트)으로 정제한다.
- [ ] `daily_workout_log`에 `raw_voice_text`(STT 원본)와 `ai_summary`(정제본) **둘 다** 저장된다.
- [ ] 카톡용 복사(클립보드) 기존 동작 그대로 유지.
- [ ] `VoiceLogTab`이 `components/tabs/VoiceLogTab.jsx`로 분리된다.
- [ ] AI 키 미설정 시 앱이 죽지 않고 친절한 안내로 폴백한다(데모 모드 유지).

## 3. 제공자 스택 (확정)

| 단계 | 제공자 / 모델 | 비고 |
|---|---|---|
| STT | OpenAI `gpt-4o-mini-transcribe` | $0.003/분, 25MB·배치, 한국어 OK |
| 요약 | Anthropic `claude-haiku-4-5-20251001` | 작은 task, 빠르고 저렴 |

환경변수(서버 전용, `NEXT_PUBLIC_` 금지): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

## 4. 아키텍처 흐름

```
[브라우저]                          [서버 라우트]                 [외부 API]
MediaRecorder 녹음
   ↓ 오디오 Blob (FormData)
   POST /api/voice-log  ───────▶  request.formData()로 audio 수신
                                     ↓ multipart 전달
                                  OpenAI transcribe  ─────────▶  STT (한국어 raw_text)
                                     ↓ raw_text
                                  Claude Haiku 요약   ─────────▶  정제된 리포트(JSON)
                                     ↓
                        { raw_text, report } 반환  ◀───────
   ↓
클라이언트에서 report 렌더 + daily_workout_log 저장(raw_voice_text, ai_summary)
```

키는 서버 라우트 안에서만 사용 — 프론트에 절대 노출 금지.

## 5. 작업 항목

### 작업 1 — API 라우트 신설: `app/api/voice-log/route.js`
- `POST` 핸들러. `const form = await request.formData();` 로 오디오 파일(`audio` 필드) 수신.
- OpenAI 트랜스크립션 호출(multipart로 파일 전달), `model: "gpt-4o-mini-transcribe"`, `language: "ko"`.
- 받은 한국어 텍스트를 Claude(`claude-haiku-4-5-20251001`)에 넘겨 아래 형식의 **JSON만** 반환하도록 요약.
- 응답: `{ raw_text, report }` (report = 아래 스키마).
- 에러/키 미설정 시 명확한 상태코드와 메시지 반환(프론트에서 폴백 처리).

**요약 프롬프트 설계 원칙 (중요):**
- AI는 **트레이너가 말한 내용만** 재구성한다. 언급 안 된 중량·세트·운동을 **지어내지 않는다.**
- 음성일지 리포트의 수치는 유지 OK(트레이너가 실제 말한 걸 정리하는 자리라서 — MASTERPLAN v1.5 규칙 #3).
- 톤: 회원에게 카톡으로 보낼 따뜻하고 명료한 존댓말.
- 반환 JSON 스키마:
  ```json
  {
    "machines": [{ "name": "머신명", "detail": "중량·세트(트레이너가 말한 경우만)" }],
    "feedback": "오늘 수업 핵심 피드백 1~2문장",
    "homework": ["홈트/주의사항 항목", "..."]
  }
  ```
  (기존 `buildText()`가 이 구조를 그대로 카톡 텍스트로 조립하므로 스키마 유지.)

### 작업 2 — `VoiceLogTab` 분리 + 실 마이크
- `components/tabs/VoiceLogTab.jsx`로 컴포넌트 이동. 부모(`app/page.jsx`)에선 import만.
- `start()`: `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaRecorder`로 녹음 시작. 파형/타이머 UI는 기존 것 재사용.
- `stop()`: 녹음 정지 → Blob 생성 → `FormData`에 담아 `/api/voice-log`로 POST → 응답의 `report`를 상태에 세팅. (기존 `setTimeout` 데모 제거.)
- 반환된 `raw_text`는 저장용으로 보관(작업 3).

### 작업 3 — DB 저장 확장
- `copyAndSave()`에서 `daily_workout_log` insert 시 `raw_voice_text`도 함께 저장:
  `{ user_id: member.id, raw_voice_text: rawText, ai_summary: text }`
- 스키마 이미 존재(마이그레이션 불필요).

## 6. 기술 주의사항 (놓치기 쉬운 것)

- **iOS 사파리 mimeType:** MediaRecorder 출력 포맷이 브라우저마다 다르다(사파리는 보통 mp4/aac, 크롬은 webm). `MediaRecorder.isTypeSupported()`로 지원 포맷을 골라 지정하고, 파일 확장자를 그에 맞춰 전송. OpenAI는 webm·mp4·m4a·wav 모두 수용하므로 포맷 자체는 문제없다 — **확장자/타입을 실제 녹음 포맷과 일치**시키는 게 핵심.
- **HTTPS 필수:** getUserMedia는 https 또는 localhost에서만 동작 → vercel.app에서 테스트(기존 습관 그대로).
- **25MB 한도:** 수업 종료 요약은 몇 분이라 여유롭지만, 안전하게 녹음 최대 길이(예: 10분) 상한을 둔다.
- **마이크 권한 거부** 케이스: 사용자에게 권한 안내 메시지 노출.
- **데모 폴백:** 키 미설정/네트워크 실패 시 앱이 죽지 않게 try/catch + 안내 문구.
- **비용 표시는 하지 말 것:** 사용자(트레이너) 화면엔 API 비용 노출 X.

## 7. Claude Code에 주는 지시 예시

> "이 브리프(`docs/v2-sprint1-voicelog.md`)대로 스프린트 1을 구현해줘.
> 먼저 `app/page.jsx`의 `VoiceLogTab`을 `components/tabs/VoiceLogTab.jsx`로 분리하고,
> `app/api/voice-log/route.js`를 만들어 OpenAI STT + Claude 요약을 연결해줘.
> 완료 기준 체크리스트를 하나씩 만족시키고, iOS 사파리 mimeType 처리를 빠뜨리지 마.
> 커밋은 작업 단위로 쪼개서 메시지를 명확히 남겨줘."

## 8. 이 스프린트가 끝나면 (다음)

- 여기서 만든 `app/api/*` 서버리스 AI 호출 패턴을 재사용 →
- 스프린트 2: 1차 OT 관찰 입력폼 + DB 저장(하드코딩 제거, "데이터 뼈대") →
- 스프린트 3: 그 실데이터 위에 AI(2차 방향 분석·등록 당위성 브리핑).

# 리모컨 실행 정지·재개와 오프라인 복구 추가 검수 — 2026-10-30

사용자가 직접 조작 대신 가능한 검수를 맡겼다. 연결된 실제 휴대폰을 조작하는 도구는 없어 **물리 회전·OS 화면 잠금은 수행하지 않았다**. 대신 아직 확인하지 않은 장시간 JavaScript 실행 정지 후 타이머 보정과 오프라인 복구를 로컬 브라우저에서 추가 검수했다. 앞선 실제 수업 PPT 19쪽 검수는 다시 반복하거나 실제 기기 검사로 재분류하지 않았다.

## 완료

공용 standalone→relay와 가이랩 내장 편집기→직접 연결, **추가 브라우저 검사 2/2 통과**. 새 임시 Edge 저장공간과 3장 검수 자료, 로컬 계정 fixture/BroadcastChannel을 사용했다. 외부 HTTP/WebSocket 요청과 브라우저 오류는 0이다.

| 검증 | 공용 | 가이랩 |
|---|---|---|
| 390×844 → 844×390 → 390×844 자동 배치와 48px 유지 | 통과 | 통과 |
| 실행 25초 정지·재개 이벤트 확인 | 통과 | 통과 |
| 실제 경과 / 타이머 차감 | 25.148초 / 25초 | 25.142초 / 25초 |
| 재개 후 48px·노트 스크롤 위치 유지 | 통과 | 통과 |
| 오프라인 시 원격 조작 비활성화 | 통과 | 통과 |
| 단절 중 교사 화면을 2쪽으로 변경 → 재연결 시 2쪽 동기화 | 통과 | 통과 |
| 복구 후 2→3→2 이동, 실행 중 타이머 멈춤 | 통과 | 통과 |

이 검수는 실제 시간 경과를 쓰며, 시간을 앞으로 조작하거나 제품의 타이머 함수를 교체하지 않았다. 임시 브라우저의 V8 실행을 CDP `Debugger.pause/resume`으로 멈췄고 두 이벤트가 관측된 뒤 검증했다. 네트워크 단절은 브라우저의 offline 설정으로 재현했다. 브라우저가 실제 OS에 의해 백그라운드 종료되거나 휴대폰이 잠겼다는 의미는 아니다.

처음 시도한 `Page.setWebLifecycleState`에서는 freeze/resume 이벤트가 관측되지 않았다. 활성 상태 강제 설정을 해제해도 같았으므로 이 시도는 **정지 검증 성공으로 집계하지 않았다**. 관측 가능한 JavaScript 정지로 검수 범위를 좁혔으며 OS freeze 검증은 미완료다. 관련 공식 설명: [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [DevTools Page protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-setWebLifecycleState).

## 재현·증거

```powershell
$env:MINICAN_PLAYWRIGHT_PATH='설치된 playwright/index.mjs 절대 경로'
node --test test/browser/onbatang-remote-lifecycle.test.mjs
```

검수 코드는 `g-ai-lab-inline/test/browser/onbatang-remote-lifecycle.test.mjs`. 보고서/가로·세로 복구 화면은 Git 제외 경로에 저장했다.

- `g-ai-lab-inline/work/qa-remote-lifecycle-20261030/common-x1waIN/`
- `g-ai-lab-inline/work/qa-remote-lifecycle-20261030/gai-dl7qYO/`

각 report는 `physicalPhone:false`, `osLock:false`, `productionAccount:false`, `paidQa:false`를 명시한다. 기존 v0.159.1의 실제 PPT·운영 연결 검증은 [앞선 기록](onbatang-remote-touch-qa-2026-10-30.md)에 별도로 유지한다.

## 보존·남은 범위

추가 제품 결함은 발견하지 않아 제품 코드/버전을 변경하지 않았다. 공유 리모컨 v0.159.1, 공통 편집기 v0.105.0을 유지한다. 이번에는 테스트·문서만 추가했으며 운영 DB·SQL·계정 쓰기를 수행하지 않았다. 문서/검사 commit의 자동 호스팅 빌드는 제품 기능 변경과 구분한다. 원본 PPT/기존 자료/PR #76·#1·#220과 기존 로컬 설정 변경을 보존했다. 유료 QA·AI 호출 없음.

실제 휴대폰의 센서 회전·손가락 조작·OS 화면 잠금/복귀·iOS Safari·카메라 QR·Wi-Fi/모바일 데이터 전환은 미완료로 남긴다. 사용자의 앞선 ‘실제 휴대폰 정상 작동’ 확인은 그대로 유효하지만, 이번 새 UI의 모든 실제 기기 항목을 통과했다는 뜻으로 확대하지 않는다. 사용자가 추가 조작을 맡기지 않아도 수행 가능한 자동 검수는 완료했다.

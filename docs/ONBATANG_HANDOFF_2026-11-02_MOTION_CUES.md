# 온바탕 인수인계 · 2026-11-02 · 모션 관찰 순서

## 이번 완료 범위

- 공용 제품 버전 0.114.0, GBE-AI Lab 반영 버전 0.168.0. 기존 0.113.0 / 0.167.0의 모션 관찰대에 **사용자가 정하는 관찰 순서**를 추가했다.
- 조각의 움직임 설정에서 재생 위치를 최대 6개 담고, 지점 이름을 고치고, 위아래로 옮기거나 삭제한다. 이름은 28자까지, 위치는 정수 0~100%다. 한 지점은 반드시 남긴다. 기본 순서로 돌아갈 수 있다.
- 시간순으로 자동 정렬하지 않는다. 교사가 `18 → 0 → 95%`로 배열하면 발표도 그대로 따른다. 자료를 다시 열어도 순서와 이름이 남고, 내려받은 HTML에서도 인터넷 없이 실행된다.
- 관찰대의 이전·다음, PageUp·PageDown, 발표 막대와 기존 리모컨 명령의 공통 이동 경로를 연결했다. 관찰대의 끝에서 한 번 더 이동하면 닫히고, 다시 이동하면 다음 슬라이드로 간다.
- 새 그래픽 **오로라 물결**은 12개 빛의 띠가 겹치며 열리고, **종이별 펼침**은 접힌 면이 다섯 꼭짓점으로 펼쳐진다. 일반 효과는 20개다. 질문 효과의 기존 힌트 진행은 별도 그대로 유지한다.
- 효과 갤러리에서도 순서를 만들어 체험한다. 다른 효과를 골랐다 돌아오면 해당 페이지의 작성 내용은 남지만, 페이지를 닫으면 사라진다. 실제 수업 저장 위치를 화면에 안내했다.
- 모바일 폭의 순서 편집 줄은 이름과 이동·삭제 버튼을 두 줄로 배치한다. 편집 패널을 바꾸면 기존 재생과 문서 이벤트를 정리한다. DOM에서 없어진 효과는 재생 상태도 종료한다.

## 사용 경로

1. 자료에서 글·도형·그림 등 조각 하나를 선택한다.
2. **움직임 → HTML 그래픽 효과**에서 효과를 고르고 **발표에서 멈춰 보며 설명하기**를 켠다.
3. 시간 막대로 원하는 순간을 찾고 **관찰 순서 만들기 → 지금 순간 담기**를 누른다. 이름·순서를 정한 뒤 **고른 조각에 적용**한다.
4. 발표 중 해당 조각을 눌러 관찰대를 열고 이전·다음으로 설명한다.
5. 자료 자동 저장 후 다시 열기, 또는 HTML 수업 내려받기로 이어간다.

[공용 체험](https://onbatang.web.app/app/effects.html#motion-study) · [GBE-AI Lab 체험](https://gbe.ai.kr/minican/app/effects#motion-study)

## 저장 계약과 구현 위치

```js
effect: {
  id: 'spectrum', when: 'press', observe: true,
  stops: [[18, '입사광'], [0, '출발점 다시 보기'], [95, '퍼진 빛']]
}
```

- `src/motion-cues.js`: 배열 정리, 최대 개수·문자 제한, 중복 위치와 잘못된 값 제외, 순서 보존. 입력을 변형하지 않고 복사한다.
- `src/effect-assets.js`: 기존 `cleanEffect`에서 관찰 효과에만 `stops`를 보존한다. 이전 자료에 필드가 없으면 효과별 기본 순서를 쓴다. 문서 전체 migration이나 SQL 변경이 필요하지 않다.
- `src/motion-cue-editor.js`: 갤러리와 조각 설정이 공유하는 순서 편집 UI.
- `src/motion-study.js`: 공통 재생·탐색·관찰 순서와 생명주기 정리. `onCuesChange`가 주어진 작성 화면에만 편집기를 표시한다.
- `src/effect-picker.js`: 효과별 작성 중 순서를 기억하고 조각에 적용한다.
- `src/effect-player.js`: `stepOpenQuestion`이 열린 관찰대를 우선 진행한다. 공용 발표, 내장 발표, HTML 수업이 같은 함수를 사용한다.
- `src/observation-accents.js`: 새 두 효과의 SVG 및 시간별 키프레임. `effect-frames.js`가 시간 위치를 그림으로 직접 그리므로 관찰대는 SVG Web Animations API에 의존하지 않는다.
- `app/effects.html`: 페이지 안에서 효과별 임시 순서 유지와 사용 안내.
- `app/html-lesson-bundle.js`, `app/pptx-import/vendor/BUILD.json` 및 worker는 원본 빌드 도구로 다시 생성했다. 내장본을 직접 수정하지 않는다.

## 검증 범위

| 구분 | 결과 |
|---|---|
| 공용 단위 시험 | 403/403 통과. 잘못된 값·중복·이름 길이·이전 자료·오프라인 대상의 순서 보존 포함 |
| 공용 로컬 Edge 및 Windows WebKit | 갤러리와 조각 효과 시험 통과. 실제 UI로 지점 추가·이름 변경·순서 변경·삭제 → 적용 → 새로고침 → 발표 → 내려받은 HTML 재열기 확인 |
| 발표 이동 경로 | Windows WebKit에서 발표의 다음 버튼으로 18 → 0 → 95% → 관찰대 닫기 확인. 닫을 때 장이 먼저 바뀌지 않음 |
| GBE-AI Lab 내장본 | Windows WebKit에서 갤러리와 편집·저장·재열기·발표·오프라인 HTML 시험 2개 통과. 일반·운영 번들 빌드, 초기 로딩·내장 페이지 Node 시험 12개 통과 |
| 모바일 화면 모사 | iPhone 13 화면 크기 및 844×390 가로 폭에서 순서 편집 화면 확인. 동작 줄이기를 켠 상태에서 직접 재생·멈춤·되감기 확인 |
| 새 효과 | 앞·뒤 그림이 다름, 같은 지점으로 돌아오면 픽셀이 일치함, 멈춤 뒤 위치 유지. 프리즘 분광·픽셀 직조도 함께 회귀 확인 |
| 실제 iPhone Safari·실제 휴대폰 리모컨 | 이번 버전 미검수. Windows WebKit은 실제 기기가 아님 |
| 실제 계정 동기화·PPTX/PowerPoint 재열기 | 이번 변경에서 별도로 반복하지 않음. 로컬 자료와 HTML 저장 검증만 완료 |

GBE-AI Lab 내장본 검사 및 양쪽 운영 배포의 최종 커밋·검증 결과는 아래 운영 기록을 따른다. 갤러리 검증을 계정 저장 검증으로 보고하지 않는다.

## 보존 범위

실제 수업 PPT 원본, 기존 사용자 자료, 기존 PR, 운영 DB·SQL·비공개 저장소를 변경하지 않았다. 유료 QA와 실제 계정·AI 생성 요청은 사용하지 않았다. 기존 GBE-AI Lab 체크아웃의 `dist/community-config.js` 및 `release-times.json` 변경은 원래 바이트 그대로 보존하며 이번 커밋에서 제외한다. GBE-AI Lab은 기존 `docs/minican.md` 동기화 절차로 반영한다.

## 다음 개발 우선순위

1. **여러 장을 잇는 모션 이야기 편집**: 현재는 조각별 효과와 관찰 순서다. 사용자가 고른 실제 슬라이드의 공통 요소를 이어 주는 전환·카메라 경로를 편집하게 하는 것이 다음 기능 개발 후보다. 기존 연결 모핑과 충돌하지 않는 데이터 계약부터 정한다.
2. **교사 콘텐츠를 쓰는 시각화 확대**: 현재 오로라·종이별은 재사용 가능한 그래픽 효과다. PPT의 도형·사진을 넣어 같은 원리로 펼치기·분해하기를 만드는 기능은 아직 없다.
3. **실물 iPhone Safari 확인**: 사용자가 신고한 ‘재생 눌러도 멈춤’은 앞선 수정과 이번 Windows WebKit 검수만으로 해결 확정하지 않는다. iOS 버전·동작 줄이기·화면 잠금 후 복구를 실제 기기에서 확인해야 한다. 운영 DB나 유료 QA는 필요 없다.
4. **내보내기 범위**: HTML은 관찰대가 동작한다. PPTX·PNG는 정지 출력이며 사용자 관찰 순서를 PowerPoint 애니메이션으로 옮기지는 않는다.

## 재현 명령

```powershell
npm test
node tools/build-html-lesson.mjs
node tools/build-pptx-import.mjs
# 설치된 Playwright 위치와 브라우저 엔진 경로를 설정한 뒤
$env:MINICAN_BROWSER='webkit' # 또는 msedge
node --test --test-name-pattern 'mobile gallery|element effects' tests/browser/html-effect-assets.test.mjs
# 내장본 검사에는 MINICAN_HOST_ROOT를 g-ai-lab-inline/dist 절대 경로로 지정
```

## 운영 기록

- **공용 Firebase Hosting 배포 완료**: 제품 0.114.0, 원본 커밋 `d4fcf585d9ffd86a04d47fd6094e5c80263c62a4`. Git 커밋의 파일로만 staging을 만들고 다시 검사했다. 배포한 `/version.json`의 커밋이 일치한다. 인수인계 마감용 문서 커밋은 이 제품 커밋 이후이며 제품 파일을 바꾸지 않는다.
- **GBE-AI Lab Cloudflare Pages 배포 완료**: 제품 0.168.0, main 커밋 `2d522ac49f1c118478d38f6971216ee28b54a589`. `https://gbe.ai.kr/version.json`에서 정확한 커밋을 확인했다.
- **내장 원본 일치**: 274개 파일을 동기화 검사했고, 운영 `/minican/SOURCE.json`의 전체 바이트가 로컬 명세와 같았다. 명세 SHA-256: `EE75D68AC5415C4364F29330BB59B0C14130D97909CFAD45B9FE2945CEE1190A`.
- **운영 브라우저 검수**: 양쪽 주소를 Windows WebKit의 iPhone 13 화면으로 열어 프리즘 분광·픽셀 직조·오로라 물결·종이별 펼침의 서로 다른 관찰 프레임, 같은 지점으로 되감기, 멈춤을 확인했다. 관찰 추가·이름 수정·재배치·삭제, 다른 효과를 골랐다 돌아왔을 때의 임시 순서 유지, 직접 재생 중에도 전체 동작 줄이기 설정은 유지되는 것을 확인했다.
- **운영 파일 대조**: 갤러리 HTML과 관련 모듈 5개의 원본 바이트를 대조했다. Cloudflare가 응답 끝에 분석용 beacon 스크립트를 붙이는 경우에는 원본 HTML 전체가 같은 앞부분인지, 추가분은 해당 스크립트 하나뿐인지 구분해서 확인한다. 호스팅 분석 스크립트를 원본 파일 변경으로 기록하지 않는다.
- **보존 확인**: GBE-AI Lab의 두 기존 변경 파일은 작업 전후 SHA-256이 같고 커밋에서 제외했다. 운영 DB·실제 계정·PPT 원본은 변경하지 않았다. 유료 QA는 사용하지 않았다.
- **CI 통과**: GBE-AI Lab [Community checks #41356384640](https://github.com/hichoni/g-ai-lab/actions/runs/41356384640)의 `verify`가 3분 33초에 성공했다. 전체 npm 시험과 Firebase 시험 단계를 포함한다. 기존 Actions checkout/setup-node/setup-java v4의 런타임 지원 종료 안내는 별도 유지보수 후보로 남긴다. Cloudflare 운영 배포와 로컬 검증도 완료했다.

[GBE-AI Lab 상세 반영 기록](https://github.com/hichoni/g-ai-lab/blob/2d522ac49f1c118478d38f6971216ee28b54a589/docs/GAI_ONBATANG_HANDOFF_2026-11-02_MOTION_CUES.md)

# 독립 온바탕 · v0.28.0

온바탕의 편집기·PPTX 작업 공간·로컬 활동은 계정 없이 씁니다. **온바탕 with 가이랩**은 같은 공통 코드를 사용하는 가이랩의 확장 제품입니다. v0.28.0은 사용자가 선택하면 가이랩 출처의 계정 연결 창을 통해 가이X로 앱을 만들 수 있습니다. 가이랩 계정 인증·AI 사용량은 가이랩에서 처리하며, 독립본의 자료·앱·결과는 기기 저장을 유지합니다. 수업방·실제 학생 제출·독립본의 계정 백업은 포함하지 않습니다. 기존 `startMinican` API와 기기 저장소 이름을 유지합니다.

호스트는 `startMinican({appMaker:{connect,generate}})`로 자체 제작 공급자를 연결할 수 있습니다. `startOnbatang`은 기본 공용 가이X 연결을 제공하며 `appMaker:null`로 숨길 수 있습니다. 다른 사이트에 옮긴 복사본은 자동으로 가이랩 계정을 사용할 수 없습니다. 연결 origin 허용 목록 또는 자체 공급자 구성이 필요합니다. [요청·저장·실행 계약](gai-slide-apps-2026-10-20.md).

편집기 진입은 **내 자료 → PPT → 내 PPT 올리기**입니다. v0.24.0은 바깥 대문의 가져오기 버튼을 없애고, 위 막대·옆 도구와 URL을 유지합니다. 가져오기 중 다른 도구나 내 그림으로 이동할 수 있고, 같은 창에서 다시 열면 파일·선택 쪽·글꼴 설정·부분 저장 재시도를 이어갑니다. 실제 저장 중에는 완료/저장 취소를 먼저 안내하며 기존 그림·실행 취소 기록을 보존합니다. 모든 파트를 저장한 뒤에만 새 자료의 첫 쪽을 바로 편집합니다. 사진/PPT/유튜브 탭과 원본 크기·비율 표시는 유지합니다. [현재 작업 수명·전체 자료 연결](ppt-workflow-2026-10-19.md), [내 자료·원본 비율](my-materials.md), [이전 내장 가져오기 계약](inline-pptx.md).

## 다른 사이트에 넣기

저장소의 `app/`, `src/`, `LICENSE`, `NOTICE`를 함께 복사하여 HTTP(S) 정적 서버에 올립니다. `/schoolgo/onbatang/app/`처럼 하위 경로에서도 작동합니다. `app/pptx-import/vendor/`의 worker·미리보기와 라이선스, `app/fonts/`의 글꼴과 OFL 고지를 빠뜨리지 마세요. 배포된 파일을 이용할 때 npm이나 CDN은 필요하지 않습니다. `file:`로 직접 여는 환경은 지원하지 않습니다.

```html
<iframe src="/onbatang/app/" title="온바탕" allow="fullscreen; autoplay; camera; microphone"
  style="width:100%;height:100dvh;border:0"></iframe>
```

같은 출처에 여러 프로젝트가 있다면 별도 시작 페이지에서 저장소 이름을 지정하세요. 편집기의 전역 스타일과 한 창당 앱 하나 원칙 때문에 iframe 사용을 권장합니다.

```html
<body class="mc-app">
  <main id="app"></main>
  <script type="module">
    import {startOnbatang} from './app/standalone.js';
    const app = await startOnbatang({storage: 'schoolgo-onbatang'});
  </script>
</body>
```

`storage`는 영문 소문자로 시작하는 1~41자의 영문 소문자·숫자·점·하이픈입니다. `tinkerlab-onbatang`처럼 프로젝트별로 구분합니다. 기본 `minican` 이름은 기존 그림과 호환됩니다. 이름을 바꾸면 이전 공간의 자료가 자동 이동하는 것은 아닙니다.

호스트는 `onMaterialSaved(graph)`와 `materialActions:[{label,run(graph)}]`로 명시적 후속 동작을 추가할 수 있습니다. `graph`는 묶음의 고정 revision, 파트별 문서, 순서대로 합친 쪽을 포함합니다. 후속 동작 전에 편집본을 고정 저장합니다. 외부 계정으로 자동 전송하지 않습니다. 호스트 글꼴은 `fonts` 및 `createImportFontServices({registry})`로 주입하되 동일 출처의 확인된 OFL 파일·고지만 교체 대상으로 사용합니다.

## 자료 흐름과 보존

v0.21.0부터 편집 중인 **내 자료 → 내 PPT 올리기**에서도 시작합니다. 현재 그림(새 빈 그림 포함)을 저장한 뒤 가져오기 화면을 열며, 닫으면 원래 그림·쪽·내 자료 탭으로 복귀합니다. 저장 실패 시 편집 화면을 유지합니다. 진행 중인 저장/일부 파트 재시도가 있으면 새 작업으로 초기화하지 않습니다. 이미 마친 가져오기는 새 파일 선택 단계에서 다시 시작합니다. PPT를 현재 그림 위에 덮어쓰거나 글꼴·비율이 다른 쪽을 무단으로 합치지 않습니다.

편집기만 사용하는 호스트는 `createEditor({documentImport:{label,description,open}})`를 선택 연결할 수 있습니다. 이 콜백은 파일 파싱·저장을 호스트에 맡깁니다. 완성 앱의 `startMinican({importAction:{label,editorLabel,open}})`은 기기 저장 및 연결된 계정 저장의 성공을 확인한 뒤 `open({from:'editor',designId,slideIndex})`를 호출합니다. `editorMode`를 생략한 기존 콜백과 대문 가져오기는 유지합니다. `openSavedDesign(id,{slideIndex,tab:'upload'})`로 저장한 편집 위치를 복원할 수 있습니다.

`importAction.editorMode: 'inline'`을 추가하면 `open(ctx)`의 `ctx.inline`에 `{root,close,openDesign}`을 전달합니다. 호스트는 `root`에 작업 공간을 붙이고 `{requestClose,dispose}`를 반환합니다. `requestClose()`는 저장·재시도 상태를 확인한 뒤 허용할 때만 `inline.close()`를 호출하며, `dispose()`는 반복 호출에도 안전하게 작업과 자원을 정리합니다. `inline.openDesign(id,{slideIndex:0,tab:'upload'})`는 같은 편집기 저장소에 미리 저장한 새 그림을 엽니다. 내장 중 일반 `openSavedDesign`이나 외부 페이지 이동으로 활성 그림을 바꾸지 않습니다. 구체적인 호출 순서와 실패 경계는 [내장 가져오기 API](inline-pptx.md)에 있습니다.

`startOnbatang`은 이 연결을 기본 제공합니다. `mountPptxApp({embedded:true,autoEdit:true,...})`는 작업 공간 자체의 중복 머리말을 숨기고, 전체 파트 및 자료 묶음 저장이 완료된 경우에만 첫 쪽의 `onEdit(id,pageIndex)`를 호출합니다. 반환한 `requestClose()`는 저장 중과 부분 완료의 재시도 작업을 보호합니다. 기존 대문 작업 공간은 `embedded:false,autoEdit:false` 기본값을 유지합니다.

기존 계정 저장을 연결하는 호스트는 선택적인 동기 함수 `sync.accepts(record)`로 계정 동기화 대상을 구분할 수 있습니다. 함수가 없으면 이전처럼 처리하고, 있으면 정확히 `true`인 그림만 계정 병합과 올리기에 포함합니다. `false`나 예외인 그림은 기기 저장을 유지합니다. 이는 기기 PPT를 기존 계정 그림 저장과 분리하는 실행 시점의 정책이며 문서·출처 스키마나 서버 권한을 변경하지 않습니다.

대문 작업 공간은 PPTX 가져오기 → 실제 PPT 화면/편집 미리보기 → 전체·원본 쪽별 글꼴 교체 → 자동 파트 저장 → 하나의 전체 자료 보기 → 쪽 편집 → 편집본 저장 → 전체 PPTX 내려받기 흐름을 유지합니다. 내 자료의 내장 진입은 전체 저장 후 첫 쪽 편집으로 바로 이어집니다. 최대 200쪽의 선택 자료를 공통 문서 한도에 맞춰 자동 분할합니다. 한 쪽 자체가 편집 범위를 넘으면 이유와 이미지 가져오기 선택을 표시합니다. 원문을 잘라 성공으로 표시하지 않습니다.

원본 Blob과 SHA-256, 출처·ID·자산 참조를 보존합니다. 기존 편집기 IndexedDB와 별도의 `${storage}-pptx-v1` DB에 원본·문서 revision·자료 묶음을 저장합니다. 편집기 초안은 기존 DB를 사용합니다. 문서와 자료 묶음의 충돌 검사 후 한 트랜잭션으로 고정하며 과거 기록을 덮어쓰지 않습니다. 일부 파트 저장 후 실패하면 같은 작업의 영수증으로 재시도합니다. 처음 가져온 자료는 읽기 전용으로 열어 최신 초안이 섞이지 않게 합니다.

전체 PPTX는 글·요소 편집형 또는 슬라이드 이미지형으로 만듭니다. 파트별 비율이 다르면 같은 비율로 맞추도록 안내합니다. 원본 PPTX는 별도로 그대로 내려받습니다. 미리보기·편집형은 PowerPoint의 모든 효과·글꼴·배치를 완전히 재현하지 않으며 애니메이션·영상은 정적 출력 범위와 구분합니다.

이 기기 저장은 계정 백업이 아닙니다. 브라우저 데이터를 지우거나 다른 출처·다른 기기를 사용하면 자료가 나타나지 않습니다. 필요한 원본과 PPTX를 내려받아 보관하세요.

## 개발·검증

`npm ci --ignore-scripts`, `npm run build:pptx-import`로 정적 자산을 재생성하고 `node tools/build-pptx-import.mjs --check`로 실제 바이트·빌드 입력·라이선스·CSP 해시를 확인합니다. `src/` 편집기는 계속 외부 빌드 의존성 없이 사용할 수 있습니다.

`npm test`와 `MINICAN_PLAYWRIGHT_PATH`를 지정한 `node --test tests/browser/standalone-pptx.test.mjs`로 검증합니다. 자체 제작 21쪽의 20+1 자동 분할, 전체 순서, 본문 편집·고정 저장·재열기, 원본 해시, 이전 기록, 두 방식의 전체 PPTX, 혼합 비율 거부, `/schoolgo/` 하위 경로, 글꼴 교체·고지·저장소 분리를 실제 Edge에서 확인합니다. 외부 요청·페이지 오류·생성된 service worker는 모두 0입니다. 실제 교사 자료·PowerPoint 앱·계정·공개 배포는 각각 증거가 있는 범위만 완료로 기록합니다.

개발 브랜치 v0.20.0과 기존 공개 GitHub Pages의 버전은 별개입니다. main 병합과 Pages 반영을 확인하기 전에는 공개 사이트가 최신이라고 안내하지 않습니다.

## Firebase Hosting 배포

공개 주소는 **[https://onbatang.web.app/](https://onbatang.web.app/)** 입니다. 최신 앱 버전·release commit은 공개 `version.json`에서 확인합니다. 최초 v0.20.0·release commit `41776457364ad2a955ab67e057f84c64ce78bd15`의146파일 HTTP bytes/SHA·실제 Edge11검사를 [최초 배포 기록](qa/2026-10-19-firebase-hosting.json)에 보존합니다. 후속 내 자료 진입은 v0.21.0부터이며 v0.21.1은 가져오기 취소 후 편집을 끝낼 때 원래 자료 화면 표시도 복원합니다. 이전 GitHub Pages에 저장한 그림이 새 Firebase 출처로 자동 이동하지는 않습니다.

최종 v0.21.1 앱 release는 `cf951d671ff7f407b4a2246e6577269d58b63b7f`입니다. 공개146파일 전체 bytes/SHA와 기존 v0.20 자료를 유지한 실제 공개 Edge 고유16항목을 확인했습니다. [내 자료 가져오기·저장/재열기 공개 검증](qa/2026-10-19-editor-import-firebase.json)에서 실패·수정·실제 계정/PowerPoint 미검증을 구분합니다. 뒤따르는 문서/검증 기록 commit도 이 앱 release를 배포 기준으로 유지합니다.

독립본은 전용 Firebase 프로젝트/Hosting 사이트 `onbatang`을 사용합니다. 가이랩·풍풍고 등 다른 프로젝트의 DB·Auth·Hosting은 배포하지 않습니다. 완성된 앱 release commit을 명시하여 정적 파일만 만들고 Hosting만 배포합니다.

```sh
node tools/build-firebase-hosting.mjs 41776457364ad2a955ab67e057f84c64ce78bd15
node tools/build-firebase-hosting.mjs 41776457364ad2a955ab67e057f84c64ce78bd15 --check
firebase deploy --only hosting --project onbatang --config firebase.json
```

`work/firebase-public`에는 확정 Git blob의 `index.html`, `app/`, `src/`, LICENSE/NOTICE와 `version.json`만 들어갑니다. 체크아웃·QA 설정·교사 원본·node_modules는 공개하지 않습니다. 예상하지 못한 파일이 섞이면 준비를 중단합니다. 공개 `version.json`의 `version`·`sourceCommit`·`sourceFiles`와 실제 파일 SHA, 실제 브라우저 가져오기·저장·재열기·내려받기를 확인한 뒤 배포 성공으로 보고합니다. 앱 release commit과 배포 도구/문서 후속 commit은 구분합니다.

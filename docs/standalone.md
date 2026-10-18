# 독립 온바탕 · v0.20.0

온바탕은 계정 없이 쓰는 편집기와 PPTX 자료 작업 공간입니다. **온바탕 with 가이랩**은 같은 공통 코드를 사용하는 가이랩의 확장 제품입니다. 가이랩의 로그인·계정 저장·활동·수업방·학생 제출은 독립본에 포함하지 않습니다. 기존 `startMinican` API와 기기 저장소 이름은 호환성을 위해 유지합니다.

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

PPTX 가져오기 → 실제 PPT 화면/편집 미리보기 → 전체·원본 쪽별 글꼴 교체 → 자동 파트 저장 → 하나의 전체 자료 보기 → 쪽 편집 → 편집본 저장 → 전체 PPTX 내려받기입니다. 최대 200쪽의 선택 자료를 공통 문서 한도에 맞춰 자동 분할합니다. 한 쪽 자체가 편집 범위를 넘으면 이유와 이미지 가져오기 선택을 표시합니다. 원문을 잘라 성공으로 표시하지 않습니다.

원본 Blob과 SHA-256, 출처·ID·자산 참조를 보존합니다. 기존 편집기 IndexedDB와 별도의 `${storage}-pptx-v1` DB에 원본·문서 revision·자료 묶음을 저장합니다. 편집기 초안은 기존 DB를 사용합니다. 문서와 자료 묶음의 충돌 검사 후 한 트랜잭션으로 고정하며 과거 기록을 덮어쓰지 않습니다. 일부 파트 저장 후 실패하면 같은 작업의 영수증으로 재시도합니다. 처음 가져온 자료는 읽기 전용으로 열어 최신 초안이 섞이지 않게 합니다.

전체 PPTX는 글·요소 편집형 또는 슬라이드 이미지형으로 만듭니다. 파트별 비율이 다르면 같은 비율로 맞추도록 안내합니다. 원본 PPTX는 별도로 그대로 내려받습니다. 미리보기·편집형은 PowerPoint의 모든 효과·글꼴·배치를 완전히 재현하지 않으며 애니메이션·영상은 정적 출력 범위와 구분합니다.

이 기기 저장은 계정 백업이 아닙니다. 브라우저 데이터를 지우거나 다른 출처·다른 기기를 사용하면 자료가 나타나지 않습니다. 필요한 원본과 PPTX를 내려받아 보관하세요.

## 개발·검증

`npm ci --ignore-scripts`, `npm run build:pptx-import`로 정적 자산을 재생성하고 `node tools/build-pptx-import.mjs --check`로 실제 바이트·빌드 입력·라이선스·CSP 해시를 확인합니다. `src/` 편집기는 계속 외부 빌드 의존성 없이 사용할 수 있습니다.

`npm test`와 `MINICAN_PLAYWRIGHT_PATH`를 지정한 `node --test tests/browser/standalone-pptx.test.mjs`로 검증합니다. 자체 제작 21쪽의 20+1 자동 분할, 전체 순서, 본문 편집·고정 저장·재열기, 원본 해시, 이전 기록, 두 방식의 전체 PPTX, 혼합 비율 거부, `/schoolgo/` 하위 경로, 글꼴 교체·고지·저장소 분리를 실제 Edge에서 확인합니다. 외부 요청·페이지 오류·생성된 service worker는 모두 0입니다. 실제 교사 자료·PowerPoint 앱·계정·공개 배포는 각각 증거가 있는 범위만 완료로 기록합니다.

개발 브랜치 v0.20.0과 기존 공개 GitHub Pages의 버전은 별개입니다. main 병합과 Pages 반영을 확인하기 전에는 공개 사이트가 최신이라고 안내하지 않습니다.

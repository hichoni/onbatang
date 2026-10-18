# PPTX 내려받기 — v0.18.0

앱의 ‘내려받기 → PPTX · 발표 파일’에서 지금 장 또는 모든 장을 한 파일로 내려받는다. PNG/JPG/영상 내려받기도 유지한다. 편집 중인 내용의 기기 저장을 먼저 완료하며 저장 실패·취소·요소 변환 실패 때 일부 파일을 성공으로 내려받지 않는다. 원본 PPT와 공통 문서의 ID·출처·자산 참조를 수정하지 않는다.

두 방식을 선택한다.

- **글·요소 편집 가능**: 글상자·기본 도형·사진은 PresentationML 객체다. 이모지·꾸밈 그림·지원하지 않는 도형/마스크는 해당 요소만 투명 PNG로 담고 경고를 반환한다. 가져오기 때 이미 이미지로 바꾼 글은 다시 편집 가능한 글로 복원하지 않는다.
- **슬라이드 이미지**: 각 슬라이드의 정적인 화면을 PNG 한 장으로 담는다. 요소별 편집은 어렵다. 영상·애니메이션·전환은 재생하지 않는다. 연결 영상 등 지원하지 않는 내용은 누락 성공 대신 오류를 반환한다.

글꼴 파일은 PPTX에 포함하지 않는다. 원본 `typeface` 또는 구성 글꼴의 `exportFamily`를 기록한다. 화면용 CSS 별칭과 PowerPoint의 설치 글꼴 이름은 구분한다. 글꼴이 없는 기기에서는 PowerPoint가 대체할 수 있다. 글꼴 조건 점검과 사용 가능한 글꼴 선택은 가져오기 호스트가 관리한다.

```js
import {createPptx} from './app/pptx.js';
const result = await createPptx({
  slides, title: '자료', size: {width: 12192000, height: 6858000, unit: 'emu'},
  mode: 'editable', // 또는 image
  signal: controller.signal,
  onProgress: ({completed, total}) => console.log(completed, total)
});
// result: {blob, bytes, mimeType, ext:'pptx', slideCount, size, warnings}
// warnings: [{code, pageNumber, elementId?, message, ...}]
```

1~200쪽, 최종 ZIP 128MiB 범위의 일괄 내보내기다. 이는 단일 편집 문서의 20쪽 한도를 바꾸지 않는다. 호스트는 여러 파트의 고정 슬라이드를 원래 순서로 모아서 전달할 수 있다. `size`는 px/pt/emu를 받고 물리 크기를 보존한다. 과거 비율 표시용 16×9px 같은 값은 정상적인 발표 크기로 처리한다. 혼합 비율을 한 파일로 내보내는 선택은 호스트가 명시적으로 처리해야 한다.

입력은 복사해서 사용한다. 사진을 읽지 못하거나 잘못된 그림이면 실패한다. `AbortSignal` 취소 시 결과를 반환하지 않는다. 브라우저의 기본 렌더러와 필요 시 주입 가능한 `renderSlide`/`renderItem`을 사용하며 외부 라이브러리·서버 업로드·글꼴 바이너리 재배포를 추가하지 않는다. 글상자 높이가 없는 과거 자료는 DOM에서 측정하고, DOM 없는 환경의 근삿값 사용은 경고한다.

CSS의 글자 크기×줄 간격은 PresentationML `spcPts`의 정확한 포인트 간격으로 기록한다. Office의 기본 줄 높이에 비율을 곱하는 `spcPct`로 오역하지 않는다. 이때 원문·글자 크기·고정 프레임·정렬을 줄여 맞추지 않는다. 형식상 슬라이드 크기는 각 축1~56인치, 편집형 글자는1~4000pt 범위를 벗어나면 오류다. 그림형에서 작은 글자를 이미지로 담는 것은 허용한다.

검증은 단위 ZIP/XML/순서/서식/크기/취소/입력 불변, 실제 Edge의 기본 렌더링과 내려받기로 구분한다. PowerPoint 데스크톱에서 직접 열어 보지 않은 경우 그 검증을 완료로 기록하지 않는다.

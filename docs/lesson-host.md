# 수업 구성·진행 호스트 연결 · v0.31.0

공통 편집기는 선택적 `lessonAction`을 제공한다. 공용 온바탕은 이 옵션을 지정하지 않으므로 수업·앱 제작 버튼을 계속 숨긴다. 이미 저장된 픽셀아트·가이X 앱·PNG 결과의 실행과 저장은 그대로 유지한다.

```js
mount({
  lessonAction: {
    label: '수업 만들기',
    editorTitle: '수업 만들기 · 진행',
    accepts: record => record.source?.kind === 'pptx',
    open: async ({designId, slideIndex, inline}) => {
      // inline.root에 호스트 수업 화면을 표시한다.
      // requestClose / dispose 계약은 importAction의 inline 화면과 같다.
      return mountLessonWorkspace({designId, slideIndex, inline});
    }
  }
});
```

편집기를 먼저 저장한 뒤 같은 작업 영역에 수업 화면을 연다. 뒤로 가기·다른 도구 이동은 공통 inline 종료 계약을 따른다. 별도 페이지 이동이나 중첩 dialog를 요구하지 않는다. 고정 자료·수업안·수업방·학생 인증·제출은 호스트의 책임이며 공통 편집기가 서버를 연결하지 않는다.

`mountGaiApp`은 선택적 `saveLabel`, `saveMessage`, `hint`, `roomState`를 받는다. 실행기의 `setRoomState({phase})`는 기존 SDK snapshot에 수업 상태를 전달한다. 호스트는 멈춤·종료 시 실행 영역을 `inert`로 전환해야 한다. 내부 앱 HTML은 기존 opaque 이중 sandbox/CSP를 유지한다. 학생 서버 점수는 앱의 `progress`나 임의 점수와 구분한다.

`mountPixelArt`의 선택적 `saveLabel`·`saveMessage`도 같은 제출 문맥을 지원한다. 기본값은 기존의 다음 슬라이드 결과 저장 동작을 유지한다. 교사 연습 checkpoint를 학생에게 전달하지 말고, 학생별 checkpoint와 PNG/답 접수 여부를 호스트에서 분리해 관리한다.

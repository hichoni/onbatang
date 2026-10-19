# 내 자료 안의 PPT 가져오기 · v0.23.0

2026-10-19 구현 범위입니다. 실제 공개 배포 완료는 별도 검증 기록과 공개 `version.json`으로 확인합니다.

## 교사와 학생이 보는 흐름

**내 자료 → PPT → 내 PPT 올리기**를 누르면 현재 그림을 저장하고, 같은 편집 화면의 작업 영역에서 파일 선택 → 슬라이드 확인 → 글꼴 교체 → 가져오기 저장을 진행합니다. 위 막대·옆 도구와 현재 URL은 유지합니다. 가져오는 동안 기존 편집 도구를 잠시 비활성화하여 뒤의 그림이 바뀌지 않게 합니다.

취소하면 기존 그림·선택한 쪽·내 자료 탭과 실행 취소 기록으로 돌아갑니다. 기존 그림의 저장에 실패하면 가져오기 화면을 열지 않습니다. 연결된 계정 저장 대상인 그림은 그 저장 성공도 확인합니다.

새 자료는 모든 선택 쪽과 자동 분할 파트, 자료 묶음의 고정 저장까지 마친 뒤 첫 쪽을 바로 편집합니다. 일부 파트만 저장된 상태에서는 새 그림으로 자동 전환하지 않습니다. 독립본의 내장 작업 공간은 저장 중과 부분 완료의 재시도 작업이 있는 동안 닫기·부분 자료 편집을 막고 이어서 재시도하도록 안내합니다. 저장한 원본 Blob·SHA-256·쪽 순서·ID·자산 참조·고정 revision을 덮어쓰지 않습니다.

대문의 ‘PPTX 가져오기’는 기존 전체 작업 공간을 엽니다. 그 경로의 완료 화면·자료 전체 보기·개별 쪽 편집·부분 저장 처리·기기 보관함은 유지합니다. 편집기 안의 진입과 대문의 진입은 같은 기기 자료를 사용합니다.

## 완성 앱의 호스트 계약

`startMinican`의 선택 옵션입니다. `editorMode`를 생략한 기존 콜백이나 순수 편집기의 `documentImport` 계약은 바꾸지 않습니다.

```js
import {startMinican} from '../app/app.js';
import {mountPptxApp} from '../app/pptx-import/app.js';

startMinican({
  storage: 'school-onbatang',
  importAction: {
    label: 'PPTX 가져오기',
    editorLabel: '내 PPT 올리기',
    editorMode: 'inline',
    open(context) {
      if (!context?.inline) return openHomeWorkspace(); // 호스트의 기존 대문 진입
      const {inline} = context;
      return mountPptxApp({
        root: inline.root,
        storage: 'school-onbatang',
        embedded: true,
        autoEdit: true,
        onClose: () => inline.close(),
        onEdit: (id, pageIndex) => inline.openDesign(id, {
          slideIndex: pageIndex,
          tab: 'upload',
        }),
      });
    },
  },
});
```

`openHomeWorkspace`는 예제 호스트가 제공하는 대문 진입 함수입니다. 독립 제품의 `startOnbatang`은 대문·내장 진입과 새 자료 묶음의 편집 문맥 복원을 직접 연결합니다.

| API | 계약 |
|---|---|
| `open(context)` | 편집기 진입에는 `from:'editor'`, `designId`, `slideIndex`, `inline`을 전달. 기존 그림의 저장 성공 후 호출 |
| `context.inline.root` | 편집기 안의 전용 DOM 영역. 호스트는 그 안에만 작업 공간을 붙임 |
| `inline.close()` | 호스트가 종료를 허용한 뒤 호출. 제공자 정리를 기다리고 기존 편집기 DOM·쪽·도구 상태를 복원 |
| `inline.openDesign(id, options)` | 같은 편집기 저장소에 저장한 새 그림을 먼저 읽고 검증한 뒤 전환. 기본 `slideIndex:0`, `tab:'upload'`. 중간 대문 화면이나 외부 URL로 이동하지 않음 |
| 반환 `requestClose()` | 사용자의 ‘편집으로 돌아가기’ 요청을 처리. 저장 중이면 거부. 허용 시 `inline.close()` 호출. 공통 작업 공간은 `Promise<boolean>` 반환 |
| 반환 `dispose()` | worker·미리보기·DOM·서비스·DB 연결 정리. 반복 호출에도 안전해야 함 |

제공자는 작업 공간을 붙인 뒤 컨트롤러를 반환합니다. 사용자의 전체 가져오기 완료까지 `open(context)`를 대기시키지 않습니다. 새 그림은 `putDesign` 등으로 먼저 저장해야 하며, 단순 변환 성공만으로 `inline.openDesign`을 호출하지 않습니다. 일반 `openSavedDesign`은 활성 편집기를 대체하지 못하므로 내장 진입에서는 `inline.openDesign`을 사용합니다.

호스트가 부분 실패 상태에서도 닫기를 제공하려면 동일 서비스·재시도 토큰·작업 화면을 다음 진입에 복원해야 합니다. 완료되지 않은 작업을 `dispose()`로 지운 뒤 재시도 가능하다고 표시하면 안 됩니다. 공통 독립본은 재시도가 남아 있는 동안 닫기를 거부하는 방식으로 보호합니다.

`mountPptxApp`의 `embedded`와 `autoEdit`는 모두 기본값이 `false`입니다. 내장 진입에서만 두 값을 `true`로 사용합니다. `onComplete`는 `complete === true`인 저장 결과에만 실행되고, 자료 묶음 저장 실패도 부분 완료로 남깁니다. 첫 쪽을 여는 데 실패해도 저장한 자료를 삭제하지 않으며 완료 화면에서 다시 열 수 있습니다.

## 기존 계정과 기기 PPT 분리

`sync.accepts(record)`는 선택적인 동기 함수입니다. 없으면 기존 계정 동기화 동작을 유지합니다. 제공하면 반환값이 정확히 `true`인 그림만 계정 병합·올리기 대상으로 삼으며, `false`나 예외는 해당 그림을 기기에 남깁니다.

이 옵션은 호스트의 실행 시점 정책입니다. 문서나 출처에 새 필드를 넣지 않고, 원본 자산 참조나 저장 스키마를 변경하지 않으며, 서버 권한 검증을 대체하지 않습니다. 독립 온바탕 자체는 계정 SDK나 원격 저장을 사용하지 않습니다. 신규 계정 수업방·운영 DB migration은 이번 공통 UI 변경의 범위가 아닙니다.

## 학교 수정 보존과 남은 경계

v0.22.1의 미설치 글꼴 처리와 v0.22.2의 목록 기호 수정은 그대로 보존합니다. 글꼴 준비·로드 실패는 대체 글꼴과 경고로 처리하고, 브라우저의 숫자 오류 코드는 한국어 미리보기 오류로 정리합니다. 편집용 가져오기는 기호·자동 번호를 글자로 보존하고 `BULLETS_AS_TEXT`로 들여쓰기 차이를 알립니다. 내장 위치 변경을 위해 이 변환·미리보기 코드를 되돌리지 않습니다.

별도 남은 경계가 있습니다. 자체 제작 XML에서 목록 스타일의 `buFont="Wingdings"`를 물려받으면서 문단에는 `buChar="l"`만 지정한 경우, 편집용 변환은 `●`를 만들지만 미리보기 정규화는 문단의 `l`을 남기고 상속 글꼴만 Arial로 바꾸는 결과를 확인했습니다. 메모리 안의 안전한 XML 재현이며 실제 해당 기호의 브라우저 픽셀·PowerPoint 표시 대조는 아직 완료하지 않았습니다. 이 상속 기호 사례는 내장 UI 변경과 분리해 추적합니다. 실제 교사 자료를 테스트 저장소나 원격 서비스에 올리지 않았습니다.

## 검증 기록 범위

구현 중 관련 기존 단위·번들 검사는 32/32 통과했습니다. 메모리 DOM 점검에서는 내장 머리말 숨김, 저장 중 닫기 거부, 부분 완료의 완료 콜백 금지, 부분 완료의 닫기·편집 보호, 재시도 완료 후 비동기 닫기를 확인했습니다. 이 결과는 실제 브라우저 검증을 대신하지 않습니다.

실제 브라우저 회귀는 [inline-pptx.test.mjs](../tests/browser/inline-pptx.test.mjs)에서 기존 편집기·URL 유지, 취소와 실행 취소, 저장 실패·부분 재시도, 전체 완료 후 새 자료 열기, 저장·재열기·PPTX 내려받기를 확인합니다. 기존 대문 흐름은 [standalone-pptx.test.mjs](../tests/browser/standalone-pptx.test.mjs)로 별도 확인합니다. 최종 통과 수치와 공개 배포 결과는 통합 검증 후 따로 기록합니다.

이번 공통 UI 작업에서 실제 계정 저장·새 기기 계정 복구·35명 동시 수업·최신 PowerPoint 실행 검수는 수행하지 않았습니다. 메일 발송·SMTP 연결은 사용자가 철회한 범위라 수행하지 않습니다. 공개 배포 완료 여부를 로컬 구현이나 위 단위 검사로 대신 판단하지 않습니다.

# 변환 결과 가져오기 경계

## v0.20.0 현재 범위 (2026-10-18)

`importConvertedDocument`의 순수 검증 경계는 유지합니다. 이제 별도 `app/pptx-import/` 모듈이 실제 OOXML 변환 worker, 격리된 PPT 미리보기, OFL 글꼴 교체, 자동 파트 저장·묶음 재열기를 제공합니다. `app/standalone.js`는 계정 없이 이를 편집기와 연결합니다. [독립본 설치·저장·검증](standalone.md). 아래 2026-10-17 기록에서 ‘아직’은 당시 상태입니다. 단일 문서 20쪽 한도는 유지하지만 전체 21쪽은 작업 흐름이 20+1로 자동 저장합니다. 계정·활동·수업방은 호스트 확장 경계입니다.

## 최초 어댑터 기록 (2026-10-17)

2026-10-17. `app/import-document.js`의 `importConvertedDocument`는 호스트가 이미 변환한 공통 모델을 검증하는 순수 함수다. PPTX 바이너리를 해석·렌더하는 엔진, 업로드, 비동기 작업 접수·재시도, 가져오기 UI, 계정 저장은 이 함수에 포함되지 않는다.

```js
import { importConvertedDocument } from './app/import-document.js';
const { record, report } = importConvertedDocument({
  report: importReport, // app/samples/studio-import.json
  document: convertedDocument, // app/samples/studio-document.json
}, { selectedPages: [2, 1] });
// 호스트가 record를 기존 저장 어댑터에 전달한다.
// report와 원본 파일·추출문 자산은 별도로 보존한다.
```

`report.selectedPages`는 전달된 `document.slides`의 각 쪽이 원본의 몇 번째 쪽인지 나타낸다. `pageCount`는 원본 전체 쪽 수다. 선택 번호는 1부터 시작하며, 중복과 범위 밖 번호를 거부한다. 옵션 `selectedPages`는 사용자가 의도적으로 고른 순서다. 옵션이 없으면 전달된 모든 쪽을 선택한다. `report.omittedPages`는 전달된 쪽 중 명시적으로 제외한 번호이고, 아직 변환되지 않아 전달되지 않은 쪽을 뜻하지 않는다. `availablePages`와 원본 `pageCount`도 함께 반환한다.

원본 크기와 원본 파일의 `source` 자산은 필수다. 자료·쪽·요소의 출처는 가져오기 보고서와 일치해야 한다. 없는 쪽·요소 ID는 원본 쪽 번호에 기반해 부여하므로 같은 변환 결과를 다시 선택하거나 재정렬해도 바뀌지 않는다. 모델 정리와 참조 검사는 `migrateRecord`를 재사용한다. 이 단계는 저장 revision을 올리지 않는다.

선택 쪽이 20쪽을 넘으면 `PAGE_LIMIT`, 선택 쪽에 120 UTF-16 단위를 넘는 텍스트가 있으면 `TEXT_LIMIT`을 던진다. 전체 21쪽 자료에서 명시적으로 `[21, 2]`를 선택하는 것은 가능하다. 별도 원본 자산을 지우거나 글을 잘라 성공으로 만들지 않는다. 오류는 `DocumentError`이고 `code`, `path`, `details`, `original`이 있다. `original`은 `{report, document}` 입력 자체이므로 호스트가 복구 파일이나 추출문을 보존할 수 있다. 메모리에 오류를 반환하는 것만으로 원본 파일의 영구 저장을 보장하지는 않는다.

## 자기 제작 표본

`node tools/fixtures/make-pptx.mjs`로 `tools/fixtures/pptx/`의 다음 자료를 재생성한다. 외부 라이브러리가 필요 없으며 ZIP 날짜와 파일 바이트는 고정된다. 글꼴 이름만 들어 있고 글꼴 파일은 포함하지 않는다.

| 파일 | 내용 | 어댑터 예상 결과 |
|---|---|---|
| `self-authored-4x3.pptx` | 4:3, 2쪽, 짧은 한글 | 성공 |
| `self-authored-long-text.pptx` | 4:3, 1쪽, 긴 한글 원문 | `TEXT_LIMIT` |
| `self-authored-21-pages.pptx` | 4:3, 21쪽, 원본 쪽 번호 | 전체 선택은 `PAGE_LIMIT` |

`manifest.json`에 실제 PPTX 바이트의 SHA-256·길이·쪽 수를 기록한다. `*.expected.json`은 같은 직접 작성 문구로 만든 **예상 데이터**이며 PPTX 변환 실행 결과가 아니다. 테스트는 PPTX의 ZIP CRC, OOXML 크기·쪽 수·문구, 예상 데이터와 원본 해시 일치를 확인한다. 실제 PowerPoint·LibreOffice 렌더 검수나 교사 자료 호환 검수로 간주하지 않는다.

## 검증과 다음 의존 작업

`node --test tests/document-import.test.mjs`로 공통 샘플·표본 경계를 검증한다. 확인 대상은 4:3, 선택 순서, 안정적인 ID, 두 차례 직렬화·재열기, 원본 출처와 자산, 21쪽과 긴 글의 명시 오류다.

후속 호스트 구현은 원본 업로드·해시 검증·소유권·고정 자산 저장을 먼저 연결하고, 변환 worker가 본 함수에 넘길 결과와 보고서를 생성해야 한다. 전체 화면 렌더와 요소 편집 데이터는 별도 결과로 처리해야 하며 글이 들어간 렌더 위에 같은 글을 겹쳐 원문 편집으로 표시하면 안 된다. 파일 손상·암호화·시간 초과·대체 글꼴·숨김 쪽·발표자 노트·표·그룹·영상 처리는 아직 실제 변환기로 검증하지 않았다. 실제 교사 PPT와 학교 기기의 시각 비교, 업로드부터 발표까지의 화면 흐름, 계정 저장, 배포 확인은 미완료다.

# 움직임 묶음 · 2026-10-29

한 장의 효과를 반복해서 고르는 대신, **전체 보기 → 한 주제씩 집중 → 전체로 돌아오기**의 흐름을 고른다. 프레지가 설명하는 전체 맥락과 확대 경로를 참고했고, 틀의 화면과 코드는 온바탕 요소로 직접 만들었다.

- [Prezi: Think beyond the slide](https://prezi.com/page/64b1dfc2-fb01-4e08-b31f-d972cf17b613/think-beyond-the-slide) — 전체 맥락에서 자세히 살펴본 뒤 다시 연결하는 확대 경로를 참고.
- [Canva: Animated presentation templates](https://www.canva.com/presentations/templates/animated/) — 낱장 효과와 전체 발표의 구성을 함께 고르는 방식을 참고. 타사에 유사 기능이 없다는 주장은 하지 않는다.

## 제공하는 흐름

| 묶음 | 흐름 |
| --- | --- |
| 이야기 지도 | 나란한 세 주제에서 하나를 크게, 나머지는 작은 길잡이로 유지 |
| 생각의 궤도 | 흩어진 생각 중 하나를 가운데로 데려오기 |
| 한 줄의 여정 | 현재 과정의 위치를 남긴 단계별 설명 |
| 관찰의 렌즈 | 비교 장면 하나를 확대하고 마지막에 함께 비교 |
| 주인공의 무대 | 이야기의 주인공을 앞으로 데려오고 다음 주인공에게 넘기기 |
| 숨 쉬는 연결 | 작은 상징이 숨 쉬는 차분한 설명 |

예제는 각각 다섯 장이며 모든 글·도형을 편집할 수 있다. 전환은 기존 `tr: 'move'`, 머무는 움직임은 기존 `lp`, 속도는 기존 `sp`를 사용한다. 새 DB·문서 스키마·외부 이미지·AI 생성은 필요 없다. 장별 ID와 요소 ID는 서로 다르게 생성하고 `origin.elementId`로 같은 조각을 연결한다. 저장해 다시 연 뒤에도 기존 이어 움직이기 런타임이 짝을 찾는다.

## 통합 API

`app/motion-sets.js`는 DOM 없는 순수 함수다.

`app/motion-set-panel.js`는 표준 모달 하나에서 여섯 묶음, 실제 5장 순차 미리보기, 앞/뒤/흐름 재생, 빠르기·숨쉬기·차분하게·예제 주제 순서와 두 저장 행동을 제공한다. 저장은 소유 앱의 `onApply(id, options)`·`onCreate(id, options)` 콜백으로 연결한다. 실패하면 선택과 입력을 보존한다. 닫을 때 타이머와 애니메이션을 정리한다. CSS는 모달 안에 한정되어 호스트의 별도 스타일 갱신이 필요 없다.

```js
import { MOTION_SETS, createMotionSequence, applyMotionSet } from './motion-sets.js';

// 새 자료 또는 새로 추가할 5장. topics의 순서가 주제를 보여 주는 순서다.
const pages = createMotionSequence('atlas', {
  aspect: 16 / 9,
  topics: ['질문', '관찰', '실행'],
  speed: 'slow',
  breathing: true,
  calm: false,
});

// 기존 자료의 내용·배치·순서·이름표·출처·자산·메모·앱을 유지한다.
// 선택한 모션 값만 바꾼 새 배열이며 받은 원본은 바꾸지 않는다.
const nextPages = applyMotionSet(pages, 'breath', { speed: '', breathing: true });
```

`speed`는 **요소 움직임의 빠르기**다. 이어 움직이기 전환의 길이는 기존 런타임의 1초다. `calm`을 켜면 차분한 나타나기로 넘기며 계속 움직이기를 끈다. 시스템의 움직임 줄이기 설정도 기존 재생기가 따른다. 기존 자료에 적용할 때 본문·사진 전체를 숨 쉬게 하지 않고 작은 꾸밈 최대 세 개만 계속 움직인다.

발표·공유 재생·HTML 수업·영상이 기존 모션 계약을 사용한다. 이 작업은 PPTX의 별도 애니메이션 호환 범위를 확장하지 않는다.

## 검증

- 순수 함수 단위 5개 통과: 여섯 묶음, 8개 화면 비율, 전역 ID 중복 방지, 저장·재열기 후 실제 짝짓기, 원본 내용·출처·자산 불변, 차분/계속 움직이기/빠르기.
- 로컬 Headless Edge 3개 통과: 실제 Web Animations로 같은 카드가 커지고 옮겨짐, 전환 후 숨쉬기, 글 편집·JSON 저장·재열기, 여섯 묶음의 마지막 요약, 시스템 움직임 줄이기. 390px 모달의 선택·실제 재생·옵션 전달·실패 후 선택 보존·중복 저장 방지·닫을 때 애니메이션 정리·새 그림 콜백도 검증했다.
- 계정·운영 데이터·실제 휴대폰·프로젝터·다운로드한 PowerPoint 검수는 위 로컬 검사에 포함되지 않는다.

실행: `node --test tests/motion-sets.test.mjs`. 브라우저 검사는 기존 방식처럼 `MINICAN_PLAYWRIGHT_PATH`를 정하고 `node --test tests/browser/motion-sets.test.mjs`.

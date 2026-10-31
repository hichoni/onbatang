# HTML 모션 에셋

편집기에서 글·도형·그림·차트 하나를 고른 뒤 **움직임 → HTML 그래픽 효과**를 연다. 에셋을 눌러 미리 보고 재생 시점·속도·색감을 정한다. **고른 조각에 적용**을 누르면 자료에 저장된다. 발표와 내려받은 HTML 수업에서는 요소를 누르거나 키보드로 초점을 옮겨 Enter 또는 Space를 누른다. 설명이 있으면 같은 요소를 다시 눌러 닫는다. **장이 열릴 때**를 고른 효과는 해당 장에서 자동 재생된다. [여덟 가지 효과 예제](../app/effects.html)

**키네틱 타이틀**은 선택한 글의 첫 72자 이내를 큰 화면에 낱말 단위로 표시한다. **데이터 포커스**는 선택한 세로·가로 막대 차트의 항목·계열·단위·값을 읽는다. 음수와 양수는 공통 0선에서 반대 방향으로 자란다. 같은 장에 자동 강조 화면이 여러 개면 차례로 보여준다. 클릭으로 연 강조 화면은 직접 닫거나 다음 장으로 이동할 때까지 유지한다.

## 재사용

조각에는 효과 ID와 재생 시점을 저장한다. 속도, 팔레트, 설명은 선택 사항이다. 자료를 고치면 새 글과 차트 값이 다음 발표와 HTML 내보내기에 적용된다.

```js
{ effect: { id: 'signal', when: 'press', pace: 'slow', palette: 'sunset', note: '전기가 흐르는 길' } }
```

`src/effect-assets.js`의 `EFFECT_ASSETS`에서 ID·이름·팔레트·그리기 함수를 관리한다. `effectArt(id)`는 정지 SVG를, `effectArt(id, true, {content, pace, palette})`는 한 번 재생하는 SVG를 돌려준다. 동작 줄이기 설정에서는 정지 그림을 쓴다. 조각 장식은 `prism`, `orbit`, `signal`, `confetti`, `underline`, `constellation`이다. `kinetic`과 `bars`는 선택 조각의 내용으로 강조 화면을 그린다.

임의의 HTML 무대에 기존 요소와 동작을 연결하려면 `src/effect-player.js`의 `mountEffectPlayer(stage, [{node, effect, content}])`를 호출한다. 강조 화면에 쓸 `content`에는 해당 온바탕 조각을 전달한다. 장식 효과에는 생략해도 된다. 무대의 CSS 위치는 `relative`로 두고, 장을 떠날 때 반환된 정리 함수를 호출한다. 설명은 일반 텍스트로 표시한다.

## 재생 및 검증 범위

편집기, 발표, HTML 수업에 같은 렌더러를 사용한다. HTML 수업에는 슬라이드 그림, 조각의 위치·크기·회전, 효과 실행 코드를 파일 하나에 넣는다. PNG·PDF·PPTX 출력의 애니메이션 변환은 별도 작업이다.

로컬 브라우저 회귀 시험은 `tests/browser/html-effect-assets.test.mjs`다. 공용 원본에서 실행하고, 내장본에서는 `MINICAN_HOST_ROOT`를 가이랩의 `dist`로 지정한다. 임시 프로필의 자료로 저장·재열기, 편집기와 발표의 클릭, HTML 내려받기, 모바일 폭 오프라인 재생을 확인한다.

### 2026-10-31 운영 인수인계

공용 Firebase v0.106.0의 제품 커밋은 `49343d4`, 가이랩 Cloudflare v0.160.0의 운영 커밋은 `7dcecce`다. 두 운영 주소에서 예제의 네 효과를 직접 재생하고 예제 HTML·효과 모듈 3개의 SHA-256이 원본과 일치하는지 확인했다. 자료 저장·재열기 시험은 공용과 가이랩의 로컬 브라우저에서 수행했다. [공용 예제](https://onbatang.web.app/app/effects.html) · [가이랩 예제](https://gbe.ai.kr/minican/app/effects.html)

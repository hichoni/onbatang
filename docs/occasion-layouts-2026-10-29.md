# 행사·연수·학교·회의용 기본 틀 · 2026-10-29

온바탕 자체 제작 틀 30종을 추가했다. 행사·무대, 연수·워크숍, 학교·공동체, 회의·포럼, 안내·캠페인에 각 6종이다. 표지만 색을 바꿔 늘리지 않고 식순, 강사 소개, 연수 목표, 실습 안내, 전후 비교, 시상, 휴식, 준비물, 회의 결정, 담당과 기한 등 실제 쓰임에 맞게 짰다.

`app/occasion-layouts.js`의 `OCCASION_LAYOUTS`를 기존 `app/layouts.js`의 `SHARED_LAYOUTS`에 이어 붙인다. 이전 24종의 id와 저장 자료는 바꾸지 않는다. 새 id는 `occasion-` 접두어를 쓴다. 모든 내용은 기존 글·도형 요소이므로 한 조각씩 편집하고 그림·PPTX로 내려받을 수 있다. 새 DB·로그인·외부 자산은 없다.

카드 원본의 가로세로 비율을 받아 위치와 글 크기를 계산한다. 네 가지 기본 비율 외에 4:3과 사용자 PPT의 넓은 비율에서도 문구가 빠지거나 페이지 밖으로 넘지 않는지 점검한다. `matchesLayout(layout, query)`는 분류·이름·키워드로 여러 단어를 함께 검색하는 보조 함수다.

참고는 자료의 **용도 분류와 단계**에 한정했다. 외부 디자인·이미지·문구를 복제하지 않았다.

- [Canva 행사·회의 순서 템플릿](https://www.canva.com/presentations/templates/agenda/): 식순과 회의의 다음 할 일처럼 서로 다른 목적의 장을 따로 제공하는 구성.
- [Canva 컨퍼런스 템플릿](https://www.canva.com/presentations/templates/conference/): 연수·포럼·강사·안내로 쓰임을 나누는 분류.
- [Microsoft PowerPoint 템플릿 안내](https://powerpoint.cloud.microsoft/create/en/templates/): 표지뿐 아니라 단계별 연수와 행사 진행을 돕는 자료 묶음.

로컬 검사: `node --test tests/occasion-layouts.test.mjs tests/minican-app.test.mjs` **15/15 통과**. 테스트 전용 Headless Edge의 `tests/browser/occasion-layouts.test.mjs` **1/1 통과**. 30종 모두 가로·세로의 실제 글상자 경계가 페이지 안에 있음을 확인했다. 전체 미리보기에서 세로 화면의 사람·해·화살표가 늘어나던 것을 찾아 꾸밈은 고유 비율을 유지하도록 고쳤다. 첫 브라우저 실행은 sandbox 임시 프로필 제한으로 시작되지 않았고, 로컬 테스트용 실행 권한으로 재실행해 성공했다.

미리보기 증거는 Git에 넣지 않는 `work/qa-occasion-layouts-2026-10-29/occasion-wide.png`, `occasion-portrait.png`다. 실제 계정·물리 기기 검수와 별개이며 이 변경에서 운영 DB는 바꾸지 않는다.

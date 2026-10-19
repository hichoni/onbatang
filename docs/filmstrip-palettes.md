# 슬라이드 띠와 나의 팔레트 · 2026-10-19

v0.26.0은 편집기의 아래 슬라이드 목록을 전체 너비로 펼칩니다. 기본 미리보기 높이는 92px이고 크기 막대로 64~152px까지 바꿉니다. 휠·트랙패드·가로 스크롤바·좌우 단추로 이동합니다. 썸네일을 끌거나 아래쪽 손잡이를 끌어 순서를 바꾸며 키보드는 썸네일에 초점을 두고 Alt+←/→를 씁니다. 손잡이는 터치 포인터도 받지만 실제 터치 기기 검수는 별도입니다.

여러 파트의 PPT는 문서나 원본 쪽 번호를 옮기지 않고 자료 manifest의 선택적 `pageOrder`에 안정적인 쪽 ID 순서를 저장합니다. 기존 manifest는 원래 순서로 열립니다. 전체 쪽을 정확히 한 번씩 포함하는 목록만 허용하며, 자료 head revision을 비교한 트랜잭션으로 새 고정본을 만듭니다. 이전 고정본과 원본 자산은 그대로입니다. `materialNavigation.load()`는 `materialRef`, `pageOrder`, `documents`를 돌려주며 호스트의 `reorder({designId,materialRef,pageIds})`가 저장합니다. 현재 초안 저장에 실패하면 순서도 바꾸지 않습니다. 모든 장의 PPTX 출력·자료 조회는 같은 순서를 사용합니다.

바탕색과 요소 색 도구에서 스포이드를 바로 누릅니다. 꾸미기 판의 I도 같은 기능입니다. 글 편집·입력 조합 중에는 가로채지 않습니다. 채집한 색은 현재 대상에 적용하고 선택한 팔레트와 최근 색에 추가합니다. 바탕색/색 선택 칸에서 1~4 슬롯을 고르고 이름을 바꾸며, 현재 색 담기·색 적용·색 삭제를 할 수 있습니다. 팔레트별 12색, 최근 12색을 저장합니다. 설정은 호스트/계정 저장소 이름별 localStorage에 두며 디자인·원본·실행 취소 기록에 넣지 않습니다. 저장 실패해도 화면의 색 선택을 막지 않습니다.

`createEditor({colorPalettes:{read(),write(state)}})`는 선택 연결입니다. 순수 편집기에 계정 SDK를 추가하지 않습니다. 연결이 없으면 화면에서만 팔레트를 사용합니다. EyeDropper API를 지원하는 HTTPS/localhost 환경에서는 사용자 누르기에서 바로 `open()`을 부릅니다. 취소·쪽/선택 변경·편집기 종료 뒤에는 결과를 적용하지 않습니다. 미지원 브라우저는 기본 색 선택 창을 열어 안내합니다. 실제 운영체제 스포이드 창·터치·Safari는 브라우저 자동화의 모의 API 검증과 구분합니다.

## 참고한 기능

- [PowerPoint 공식 안내](https://support.microsoft.com/en-gb/powerpoint/training/add-rearrange-duplicate-and-delete-slides-in-powerpoint): 썸네일 끌기로 슬라이드 순서 변경.
- [Figma 공식 안내](https://help.figma.com/hc/en-us/articles/27643269375767-Sample-colors-with-the-eyedropper-tool): I 단축키와 화면 색 추출.
- [Canva 공식 안내](https://www.canva.com/en_gb/help/color-palettes/): 색을 팔레트 묶음으로 관리.
- [EyeDropper API](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper/open): 사용자 동작·지원 범위·취소 처리.

구현은 온바탕의 기존 코드와 직접 그린 아이콘을 사용합니다. 다른 제품의 코드·이미지 자산을 복사하지 않습니다. 검증 결과와 실제 배포 commit은 세션 완료 기록에서 구분합니다.

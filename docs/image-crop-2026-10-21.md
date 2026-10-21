# 이미지 자르기 · 2026-10-21

공통 온바탕 v0.33.0. 사진을 선택하고 **자르기**를 누른 뒤 모서리 손잡이 또는 왼쪽/위쪽/가로/세로 백분율로 영역을 정한다. 안쪽 끌기·방향키(Shift로 큰 이동), 원본 전체·정사각형·4:3·16:9, 적용·취소·Esc를 지원한다. 범위 밖·너무 작은 영역은 안내하며 저장하지 않는다.

`crop:{x,y,w,h}`는 원본 이미지 좌표 0..1이다. 원본 URL·자산·출처·ID를 유지하고 새 비트맵으로 덮어쓰지 않는다. 자른 영역의 픽셀 크기와 슬라이드 위치를 회전/뒤집기를 고려해 유지한다. 전체로 복원하면 잘려 보이지 않던 영역이 돌아온다. PPT에서 이미 래스터화해 가져온 자르기는 가져온 이미지 범위 안에서만 복원할 수 있다.

모델과 저장 경계가 잘못된 좌표를 거부한다. 취소는 원문을 바꾸지 않고 적용은 하나의 undo 기록이다. 저장·JSON 재열기·복제에서 crop을 유지한다. 화면/PNG/JPG/영상은 같은 렌더러를 사용하고 편집형 PPTX는 원본 이미지와 DrawingML `a:srcRect`를 넣어 PowerPoint의 그림 자르기로 유지한다. 모양 마스크가 있으면 기존 요소별 raster 경로를 쓴다. 원본 PPT bytes와 이전 고정본은 바꾸지 않는다.

근거: [Microsoft 사진 자르기](https://support.microsoft.com/en-us/office/graphics-visuals/crop-a-picture-in-office), [DrawingML SourceRectangle](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.sourcerectangle). 원본에서 영역을 가리는 방식과 출력 좌표 계약을 참고했다.

검증: 순수 계산 4개(회전/뒤집기 조합·원본 복원·저장 재열기/복제·잘못된 좌표)와 실제 Edge 1개(적용·취소·undo/redo·IndexedDB 새로고침·PNG 좌우/중앙 픽셀·PPTX srcRect·드래그·390px 가로 넘침 없음). 최초 브라우저 실행은 sandbox Edge 시작 실패였으며 허용된 로컬 실행으로 진행했다. 이후 검사의 선택 해제와 손잡이 범위 locator를 수정했으며 제품 동작 실패로 합산하지 않는다. 실제 물리 휴대폰/태블릿 및 이번 출력의 PowerPoint 데스크톱 재열기는 미검수다.

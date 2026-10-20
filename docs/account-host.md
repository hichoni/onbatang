# 계정 수업 목록 · 선택적 호스트 연결

v0.32.0의 `startMinican({accountAction})`은 `{label, editorTitle?, open(context)}`를 받는다. 공용 기본값은 null이며 서버·로그인·계정 버튼을 추가하지 않는다. 저장된 앱·활동·PNG 결과는 이전처럼 실행·저장한다.

`context.from`은 home/editor다. editor에서는 현재 그림을 저장한 뒤 designId/slideIndex를 제공한다. home에서는 빈 그림을 만들지 않으므로 designId가 없다. 양쪽 모두 inline.root, inline.close(), inline.openDesign(id,{slideIndex,tab})를 제공한다. openDesign은 호스트가 같은 편집 저장소에 실제로 저장한 기록만 연다.

호스트는 {requestClose,dispose}를 반환한다. 쓰기 중 requestClose는 false를 반환할 수 있으며, 읽기/목록 로딩은 dispose로 취소해 다른 작업을 계속할 수 있게 한다. 늦은 계정 동기화가 열린 수업 화면을 덮어쓰지 않는다. 편집기 안의 이동은 기존 PPT 인라인 화면과 같은 저장/실행 취소 보호를 쓴다.

계정 인증·권한·수업 목록·학생 결과·원래 PPT 대조·고정 저장은 호스트 책임이다. 편집기 원본에는 Supabase 주소·자격증명·학생 기록·SQL을 넣지 않는다. 가이랩의 결과 반환은 PNG/텍스트만 새 슬라이드에 추가하고 앱 코드를 가져오지 않는다.

검증: 공통 단위 203개, 임시 로컬 Edge에서 공용 숨김·home의 빈 그림 미생성·동기화 응답 지연·저장 후 내부 목록·이동 거부/복귀·이미 저장한 결과 편집기 열기를 확인했다. 실제 서버 계정과 물리 기기 검증은 호스트 기록과 구분한다.

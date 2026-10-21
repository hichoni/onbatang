# 인수인계 · 발표자 노트와 발표 도구 (2026-10-21)

> 새 세션 첫 메시지 예: "온바탕 docs/HANDOFF-presentation-tools-2026-10-21.md 읽고 이어서 하자."
> 같은 파일이 가이랩 저장소 `docs/HANDOFF-presentation-tools-2026-10-21.md` 에도 있다.

## 지금 상태 (배포 전)

| 저장소 | 브랜치 | PR | 버전 | 상태 |
| --- | --- | --- | --- | --- |
| hichoni/onbatang | `claude/gallant-goldberg-w34r07` | [#16](https://github.com/hichoni/onbatang/pull/16) | v0.34.0 | 검토 대기. main 병합·Firebase 배포 안 함 |
| hichoni/g-ai-lab | `claude/gallant-goldberg-w34r07` | [#105](https://github.com/hichoni/g-ai-lab/pull/105) | v0.81.0 | 검토 대기. 온바탕 브랜치 커밋 `b8bc43e` 를 동기화한 상태 |

- 운영 사이트는 그대로다: 공용 온바탕 https://onbatang.web.app/ = v0.33.4, 가이랩 운영 = v0.80.0.
- 공용 온바탕은 Firebase 수동 배포, 가이랩은 `main` 병합 시 Netlify 자동 배포다.

## 무엇을 했나

캔바·미리캔버스(공식 도움말 기준)와 비교해 온바탕에 없거나 약했던 **발표** 기능을 보강했다. 원칙: 가벼움(바깥 라이브러리·네트워크 없음), HTML 호환, PPT → 가이X 앱 → 발표의 매끄러운 연결.

1. **발표자 노트**: 꾸미는 화면 그림 아래 칸. PPTX 가져오기(노트 쪽 본문) → 편집 → 편집형 PPTX 내보내기(notesSlide). HTML 수업에는 선택 시에만(기본 넣지 않기). 가이X 맥락에 고른 쪽 노트 1,200자까지.
2. **발표 단축키·도구**(온바탕 발표 = HTML 수업, `app/show-keys.js`·`app/show-tools.js`): Home/End · 번호+Enter · G 전체 보기 · B/W 검은·흰 화면 · P 펜 · L 레이저 · E 지우기 · S 발표자 화면(지금·다음 쪽, 노트, 시간) · F 전체 화면 · ? 도움말 · 좌우 밀기.
3. **앱 쪽 프레젠터**: 가이X 앱 안을 누른 뒤에도 앱이 쓰지 않은 PageDown·PageUp·Esc 가 발표로 간다.
4. **발표자 창과 전체 화면**: 새 창을 열면 브라우저가 전체 화면을 풀 수 있어, 발표자 창이 열려 있으면 발표를 끝내지 않고 F 로 다시 켠다.

자세한 비교표·사용법·구조: [presentation-tools-2026-10-21.md](presentation-tools-2026-10-21.md).

## 개인정보 확인

- 학생 수업방(가이랩)의 쪽 투영 `onbatang_public_document_page`·`onbatang_room_snapshot` 은 `id·bg·items` 만 보낸다 → 노트는 학생에게 가지 않는다.
- HTML 수업 파일은 학생에게 나눠 줄 수 있어 노트 기본값을 **넣지 않기**로 했다.

## 검증

- 온바탕 `npm test` 218/218, 브라우저 `tests/browser/presentation-tools.test.mjs` 2/2(Chromium: `MINICAN_PLAYWRIGHT_PATH=<playwright index.mjs> MINICAN_BROWSER=chromium`).
- 전체 브라우저 점검은 이 환경 Chromium 에서 v0.33.4 원본과 **같은 14개**가 실패(활동 제작 숨김 뒤 바뀌지 않은 점검, Edge 전용 등). 새로 생긴 실패 없음.
- 가이랩 `npm run build` 성공, `npm test` 629/629. 로컬 `minican-app.html` 에서 노트·발표자 창·F·검은 화면·Esc, 페이지 오류 0, 바깥 요청 0.
- PPTX 노트: python-pptx 1.0.2·LibreOffice 로 읽힘 확인.
- **미확인**: 실제 PowerPoint 데스크톱 재열기, 실제 프레젠터 리모컨, 두 모니터 교실, 운영 계정, Netlify 미리보기 버전 표시.

## 다음 할 일 (순서대로)

1. [ ] 온바탕 PR #16 검토·병합(`main`).
2. [ ] 공용 온바탕 Firebase 배포 → https://onbatang.web.app/version.json 이 0.34.0 인지 확인. (이 작업 공간에서는 Firebase 로그인이 필요하다.)
3. [ ] 가이랩에서 병합된 온바탕 `main` 커밋으로 다시 동기화:
       `node scripts/sync-onbatang.mjs <onbatang checkout> <main commit>` → `--check` → `npm run build` → `npm test` → `docs/minican.md` 의 커밋 해시 바꾸기 → PR #105 에 push.
       (`npm run build` 가 바꾸는 `release-times.json` 은 커밋하지 않는다. 얕은 clone 의 기록 때문에 생기는 변경이다.)
4. [ ] PR #105 의 Netlify 미리보기에서 v0.81.0 과 발표 도구 확인 → 병합 → 운영 버전 확인.
5. [ ] 실제 교실 점검: 리모컨으로 앱 쪽 넘기기, 두 화면에서 발표자 창, PowerPoint 에서 노트 재열기.

## 다음 후보 기능 (이번에 안 함)

전체 슬라이드 글 찾기·바꾸기 · 사진을 같은 자리·크기로 바꾸기 · 자동 넘기기 · 휴대폰 리모컨 · 실시간 질문·반응 · 공개 보기 링크/임베드(공용 온바탕은 서버 저장을 넣지 않는 원칙과 충돌).

## 참고: 작업 환경

- 이 작업은 클라우드 세션(claude.ai/code)에서 했다. REA(역분석 도구) 6.7.0 을 설치했고, 환경 시작 스크립트에 `npm install --global rea-agents@6.7.0` · `rea setup --client claude_code --yes` 를 넣어 새 세션에서도 준비된다.
- 경쟁 사이트는 이 환경의 네트워크 정책 때문에 직접 접속이 막혀(403) 공식 도움말 검색 결과로 비교했다.

# 아이폰 터치 환경에서 PPT 가져오기

**공용 v0.112.1 · 가이랩 v0.166.1**. 미리보기 뒤 원본 파일을 저장할 때 일부 WebKit 환경의 IndexedDB가 Blob 쓰기를 거부했다. 새 자료는 파일 바이트를 ArrayBuffer로 보관하고, 읽을 때 새 형식과 기존 Blob의 길이·SHA-256을 모두 확인한다. [재현 절차와 로컬 시험](https://github.com/hichoni/g-ai-lab/blob/ea812a4af588cebb913497684a3f4ad53b087d0e/docs/GAI_ONBATANG_HANDOFF_2026-11-01_WEBKIT_PPT.md)

- 수정 전후에 같은 2쪽 PPT를 공용 운영 화면에서 골랐다. WebKit의 iPhone 13 설정에서 수정 전에는 `IMPORT_STORAGE_FAILED: upload`로 끝났고, 수정 뒤에는 저장·새로고침·원본 바이트 대조까지 통과했다. 로컬에서는 실과 PPT 19쪽과 8개 저장 파트도 같은 방법으로 다시 열었다.
- 가이랩 운영 주소에서 받은 기기 저장 모듈로 같은 PPT 바이트를 WebKit에서 저장하고 새로고침 후 다시 읽었다. Edge에서는 이전 Blob 형식으로 저장한 원본도 새 코드에서 읽어 파일 전체가 같은지 확인했다. 배포 커밋은 공용 `85a3ecd`, 가이랩 `ea812a4`이며 내장 명세 원본 파일은 266개다.
- 실제 아이폰의 Safari, 카카오톡 안에서의 실행, 실제 계정 복구는 별도다. 운영 DB와 유료 QA를 사용하지 않았다. GitHub Actions verify는 계정 결제·지출 한도로 시작되지 않았고 Cloudflare 운영 빌드는 통과했다.

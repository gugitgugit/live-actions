# 개발 문서

직접 빌드하거나 코드를 고치려는 사람을 위한 문서입니다. 기술·아키텍처를 선택한 과정과 근거는 [설계 문서](DESIGN.md)에 있습니다.

## 동작 방식

| 항목 | 구현 |
|---|---|
| 인증 | GitHub App + OAuth Device Flow (client secret 불필요), 대안으로 fine-grained PAT |
| 폴링 | 적응형 — 끝나기 직전 2.5초, 팝업이 열려 있거나 GitHub 탭이 보이면 10초, 그 외 `chrome.alarms` 30초/1분 |
| Rate limit | `ETag` 조건부 요청 — `304` 응답은 한도에서 차감되지 않음 |
| 남은 시간·진행률 | 같은 워크플로의 최근 성공 run 5개에서 job·step별 소요 시간을 구해 각 job이 끝날 시각을 예측 (job 순서도 이력에서 추정, 러너 대기 시간 제외). 이력이 없으면 step 완료율 |
| 페이지 내 바 | content script + Shadow DOM, GitHub 테마 변수 사용, 페이지 이동은 DOM 변경 감지로 처리 |

```
src/
  background/   폴링, 상태 전이 감지, 배지, 알림, 토큰 갱신(단일 소유)
  content/      github.com 페이지 안 진행 바와 상태 아이콘 동기화 (React 없이 DOM API)
  popup/        툴바 팝업
  options/      로그인, 저장소 선택, 알림 설정
  shared/       화면들이 함께 쓰는 hook, 아이콘, 테마
  lib/          판단 로직(진행률·남은 시간 예측·페이지 판별 등)과 GitHub 클라이언트. 대부분 순수 함수라 단위 테스트 있음
public/_locales/  UI 문구 (en, ko). 문구를 추가할 때는 두 파일에 같은 키를 넣기 (테스트가 검사)
docs/           설계 문서, 개발 문서, 아이콘 원본, Web Store 등록 정보와 이미지(store/)
scripts/        아이콘·스토어 이미지 렌더링 (headless Chrome)
```

## 빌드와 실행

```bash
npm install
cp .env.example .env    # GitHub App 정보 입력 (아래 참고)
npm run dev             # chrome://extensions → 개발자 모드 → "압축해제된 확장 프로그램 로드" → dist/
npm test
npm run build
```

`.env` 없이도 빌드되며, 이 경우 PAT 로그인만 노출됩니다.

## GitHub App 등록 (1회)

직접 빌드한 확장으로 "GitHub로 로그인"을 쓰려면 자기 GitHub App이 필요합니다.

[GitHub → Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new)

| 항목 | 값 |
|---|---|
| Homepage URL | 저장소 또는 소개 페이지 URL |
| Callback URL | 비워둠 (Device Flow만 사용) |
| **Enable Device Flow** | ✅ 체크 |
| Webhook → Active | ❌ 해제 |
| Repository permissions | **Actions: Read-only**, **Metadata: Read-only** |
| Where can this GitHub App be installed? | 다른 사람도 쓰게 하려면 **Any account**, 생성 후 Advanced → **Make public** |

생성 후 **Client ID**를 `VITE_GITHUB_CLIENT_ID`에, 앱 URL의 slug(`github.com/apps/<slug>`)를 `VITE_GITHUB_APP_SLUG`에 넣습니다. Client secret과 private key는 필요 없습니다.

> User token은 기본 8시간 만료 + refresh token(6개월) 방식이고, 확장이 자동 갱신합니다. Device Flow로 발급된 토큰은 client secret 없이 갱신할 수 있습니다.

## Chrome Web Store 배포

1. `package.json`의 `version` 올리기 → `npm run zip` → `live-actions-<version>.zip` (`.env`가 있는 상태에서)
2. [개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 업로드하고 [등록 정보 문서](store/listing.md)의 설명·권한 사유·데이터 사용 답변을 입력
3. 기능·권한·저장 데이터가 바뀌었으면 등록 정보 문서와 [개인정보처리방침](../PRIVACY.md)도 함께 수정

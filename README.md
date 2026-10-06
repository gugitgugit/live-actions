# Actions Pulse

GitHub Actions 워크플로 진행도를 GitHub 페이지 안과 툴바에서 바로 보여주는 Chrome 확장 프로그램 (Manifest V3).

- **GitHub 페이지 안 진행 바**: PR·저장소 코드 화면·Actions 탭에서 새로고침 없이 진행과 완료 여부 확인 (보고 있는 저장소 자동 추적)
- **GitHub 기본 상태 아이콘 동기화**: 저장소 메인의 최근 커밋 ✓/✗/● 아이콘이 새로고침 없이 Actions 결과에 맞춰 바뀜
- 실행 중인 run별 진행 바, 현재 job/step, 예상 남은 시간
- 툴바 배지: 실행 중 개수, 확인하지 않은 실패는 빨간 `!`
- 완료/실패 데스크톱 알림 (클릭하면 run 페이지로 이동)
- 별도 서버 없음 — 토큰은 브라우저 `chrome.storage.local`에만 저장
- 한국어·영어 지원 (브라우저 언어를 따름)

기술·아키텍처 선택 과정과 근거는 [설계 문서](docs/DESIGN.md)에 정리되어 있습니다.

## 동작 방식

| 항목 | 구현 |
|---|---|
| 인증 | GitHub App + OAuth Device Flow (client secret 불필요), 대안으로 fine-grained PAT |
| 폴링 | 적응형 — 끝나기 직전 2.5초, 팝업이 열려 있거나 GitHub 탭이 보이면 10초, 그 외 `chrome.alarms` 30초/1분 |
| Rate limit | `ETag` 조건부 요청 — `304` 응답은 한도에서 차감되지 않음 |
| 진행률 | 같은 워크플로의 최근 성공 run 5개 중앙값으로 보간하되 실제 step 진행도를 넘지 않음, 이력이 없으면 step 완료율 |
| 페이지 내 바 | content script + Shadow DOM, GitHub 테마 변수 사용, 페이지 이동은 DOM 변경 감지로 처리 |

```
src/
  background/index.ts   폴링, 상태 전이 감지, 배지, 알림, 토큰 갱신(단일 소유)
  lib/auth.ts           Device Flow, refresh
  lib/github.ts         REST 클라이언트 + ETag 캐시
  lib/progress.ts       진행률/예상 시간 계산 (단위 테스트 있음)
  lib/page.ts           GitHub URL 판별, 페이지별 run 선택 (단위 테스트 있음)
  lib/storage.ts        타입이 지정된 chrome.storage 래퍼
  popup/                툴바 팝업
  options/              로그인, 저장소 선택, 알림 설정
  content/              github.com 페이지 안 진행 바 (React 없이 DOM API)
public/_locales/        UI 문구 (en, ko). 문구를 추가할 때는 두 파일에 같은 키를 넣기 (테스트가 검사)
```

## 개발

```bash
npm install
cp .env.example .env    # GitHub App 정보 입력 (아래 참고)
npm run dev             # chrome://extensions → 개발자 모드 → "압축해제된 확장 프로그램 로드" → dist/
npm test
npm run build
```

`.env` 없이도 빌드되며, 이 경우 PAT 로그인만 노출됩니다.

## GitHub App 등록 (1회)

[GitHub → Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new)

| 항목 | 값 |
|---|---|
| Homepage URL | 저장소 또는 소개 페이지 URL |
| Callback URL | 비워둠 (Device Flow만 사용) |
| **Enable Device Flow** | ✅ 체크 |
| Webhook → Active | ❌ 해제 |
| Repository permissions | **Actions: Read-only**, **Metadata: Read-only** |
| Where can this GitHub App be installed? | **Any account** (Web Store 배포 시) |

생성 후 **Client ID**를 `VITE_GITHUB_CLIENT_ID`에, 앱 URL의 slug(`github.com/apps/<slug>`)를 `VITE_GITHUB_APP_SLUG`에 넣습니다. Client secret과 private key는 필요 없습니다.

> User token은 기본 8시간 만료 + refresh token(6개월) 방식이고, 확장이 자동 갱신합니다. Device Flow로 발급된 토큰은 client secret 없이 갱신할 수 있습니다.

## Chrome Web Store 배포 체크리스트

1. `package.json`의 `version` 올리기 → `npm run zip` → `actions-pulse-<version>.zip`
2. [개발자 대시보드](https://chrome.google.com/webstore/devconsole) 등록 (최초 1회 등록비 $5)
3. 스토어 등록 정보: 설명, 스크린샷 1280×800, 작은 프로모션 타일 440×280
4. **Privacy practices** 탭
   - Single purpose: "Show the progress of the user's GitHub Actions workflow runs."
   - 권한 사유
     - `storage`: 로그인 토큰, 감시 저장소, 마지막 run 상태 저장
     - `alarms`: 주기적으로 GitHub API를 조회해 진행도 갱신
     - `notifications`: run 완료/실패 알림
     - `https://api.github.com/*`: 워크플로 run/job 조회
     - `https://github.com/*`: OAuth Device Flow 로그인 엔드포인트, PR·코드·Actions 화면에 진행 바 표시(content script)
   - Remote code: 사용 안 함
   - Data usage: "Authentication information" 수집 체크, 판매/전송 없음
   - 개인정보처리방침 URL: [PRIVACY.md](PRIVACY.md)를 GitHub Pages 등에 게시한 주소

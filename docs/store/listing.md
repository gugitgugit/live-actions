# Chrome Web Store 등록 정보

[개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 그대로 붙여 넣을 내용입니다. 스토어 페이지: <https://chromewebstore.google.com/detail/live-actions-for-github/fnfmpglkebgbokpmlcbadploemgilpgl> (항목 ID `fnfmpglkebgbokpmlcbadploemgilpgl`) 기능·권한·저장 데이터가 바뀌면 이 문서와 [개인정보처리방침](../../PRIVACY.md)을 함께 고칩니다.

## 패키지

- `npm run zip` → `live-actions-<version>.zip` (버전은 `package.json`)
- 빌드할 때 `.env`의 `VITE_GITHUB_CLIENT_ID`·`VITE_GITHUB_APP_SLUG`가 들어가 있어야 함. 없으면 GitHub App 로그인 없이 PAT 로그인만 나옴

## Store listing 탭

| 항목 | 값 |
|---|---|
| 이름 | `Live Actions for GitHub` (manifest `extName`, 75자 제한 중 23자) |
| 요약 | manifest `extDescription`이 쓰임 (132자 제한, 영어 124자·한국어 65자) |
| 카테고리 | Developer Tools |
| 언어 | 영어(기본), 한국어 — 상세 설명은 언어별로 입력 |
| 스토어 아이콘 | [`icon-128.png`](icon-128.png) (그림 96px + 여백 16px) |
| 작은 프로모션 타일 (필수) | [`promo-440x280.png`](promo-440x280.png), 원본 [`promo-tile.html`](promo-tile.html) |
| 스크린샷 (1장 이상, 최대 5장) | 1280×800, 언어별 4장 — 아래 목록 |
| 홈페이지 URL | https://github.com/gugitgugit/live-actions |
| 지원 URL | https://github.com/gugitgugit/live-actions/issues |

이미지는 `sh scripts/render-icons.sh store`로 다시 만듭니다.

### 스크린샷 목록

[`screenshots/`](screenshots)에 언어별(`-en`, `-ko`)로 있고, 이 순서로 올립니다.

1. `inpage` — 저장소 화면 안 진행 바와 상태 아이콘(●)
2. `popup` — 툴바 팝업 (실행 중 run, 최근 완료)
3. `notification` — 완료 알림
4. `options` — 설정 화면 (계정, 알림 받을 저장소)

화면은 모두 실제 확장 프로그램 코드가 그린 것입니다. 개인정보가 담기지 않도록 팝업·설정 화면은 예시 데이터(`acme/*` 저장소)로, 진행 바는 이 저장소의 공개 페이지에 이 저장소 CI의 실제 단계 정보로 그렸고, 알림은 실제 알림을 캡처했습니다. 캡처용 예시 데이터와 스크립트는 저장소에 두지 않습니다.

### 상세 설명 — English

```
See GitHub Actions results without refreshing.

The Actions tab updates live, but the repository page does not: the yellow dot next to the latest commit stays until you reload. Live Actions keeps the pages you already use up to date while your workflows run – tests, deployments, releases, anything on GitHub Actions.

• Status icons that keep up – the ✓ / ✗ / ● next to the latest commit changes the moment its workflows finish.
• Progress bars inside GitHub – on the repository page, branches and pull requests (both the classic and the new Overview page), with the current job and step and the estimated time left.
• One bar per parallel job – jobs running side by side, such as a test matrix, each get their own bar.
• Tag runs too – a release or deploy started by pushing a tag on the latest commit shows up right there, labeled with the tag.
• Toolbar badge and popup – how many runs are in progress, and a red "!" for failures you have not seen yet.
• Desktop notifications – titled with the workflow name ("Deploy passed", "❌ CI failed"). Click to open the run.
• Accurate time left – estimated per job and step from recent successful runs, not counting time spent waiting for a runner.

Private and lightweight
• No server: your token and data stay in your browser and the extension talks only to GitHub.
• Read-only access to Actions and repository metadata. It cannot read or change your code.
• Conditional requests (ETag) keep GitHub API usage low: unchanged answers do not count against your rate limit.
• Stays signed in through sleep and flaky networks, and applies its own updates right away.

Getting started
1. Sign in with GitHub (or use a fine-grained personal access token).
2. Open a repository on GitHub – progress bars appear automatically, no setup needed.
3. Pick the repositories you want in the popup, badge and notifications on the settings page.

Public repositories work right away. For private ones, grant Live Actions access on GitHub (a link is on the settings page).

Available in English and Korean. Open source: https://github.com/gugitgugit/live-actions

Live Actions is an independent project and is not affiliated with or endorsed by GitHub.
```

### 상세 설명 — 한국어

```
새로고침 없이 GitHub Actions 결과를 확인하세요.

Actions 탭은 실시간으로 갱신되지만, 레포지토리 메인 화면은 다릅니다. Actions가 끝나도 최근 커밋 옆 노란 점(●)이 그대로이고, 새로고침해야 바뀝니다. Live Actions는 테스트, 배포, 릴리스 등 Actions로 도는 모든 워크플로의 진행 상황을 지금 보고 있는 화면에서 바로 보여줍니다.

• 따라 바뀌는 상태 아이콘 – 최근 커밋 옆 ✓ / ✗ / ● 아이콘이 워크플로가 끝나는 즉시 바뀝니다.
• GitHub 화면 안 진행 바 – 레포지토리 화면, 브랜치, PR(기존 화면과 새 Overview 화면 모두)에서 현재 job·step과 예상 남은 시간을 보여줍니다.
• 병렬 job은 따로 – matrix처럼 동시에 도는 job은 job마다 진행 바를 보여줍니다.
• 태그 실행도 함께 – 최근 커밋에 태그를 push해서 도는 릴리스·배포도 Actions 탭에 가지 않고 바로 보입니다. 태그 이름표가 붙습니다.
• 툴바 배지와 팝업 – 실행 중인 run 수, 아직 확인하지 않은 실패는 빨간 "!"로 알려줍니다.
• 데스크톱 알림 – "Deploy 성공", "❌ CI 실패"처럼 워크플로 이름으로 알려주고, 클릭하면 해당 run으로 이동합니다.
• 정확한 남은 시간 – 최근 성공한 run의 job·step별 소요 시간으로 예측하며, 러너 대기 시간은 뺍니다.

가볍고 안전하게
• 별도 서버 없음: 토큰과 데이터는 브라우저 안에만 저장되고 GitHub하고만 통신합니다.
• Actions와 레포지토리 메타데이터 읽기 권한만 씁니다. 코드를 읽거나 바꿀 수 없습니다.
• 조건부 요청(ETag)으로 API 사용량을 줄였습니다. 바뀐 게 없는 응답은 한도에서 빠집니다.
• 잠자기나 불안정한 네트워크에서도 로그인이 유지되고, 새 버전은 바로 적용됩니다.

시작하기
1. GitHub로 로그인합니다 (fine-grained 개인 액세스 토큰도 사용 가능).
2. GitHub에서 레포지토리를 열면 별도 설정 없이 진행 바가 나타납니다.
3. 팝업·배지·알림에 표시할 레포지토리를 설정 화면에서 고릅니다.

공개 레포지토리는 바로 동작합니다. 비공개 레포지토리는 GitHub에서 Live Actions에 접근 권한을 주면 됩니다 (설정 화면에 링크가 있습니다).

한국어와 영어를 지원합니다. 오픈 소스: https://github.com/gugitgugit/live-actions

Live Actions는 개인 프로젝트이며 GitHub와 제휴하거나 GitHub의 보증을 받지 않았습니다.
```

## Privacy practices 탭

**Single purpose**

```
Show the progress and results of the user's GitHub Actions workflow runs – inside GitHub pages, in the toolbar and as notifications.
```

**Permission justification**

| 권한 | 사유 |
|---|---|
| `storage` | `Stores the sign-in token, settings, and recent workflow run data locally so progress can be shown without fetching everything again.` |
| `alarms` | `Wakes the background service worker periodically to check GitHub for workflow run updates.` |
| `notifications` | `Shows a desktop notification when a workflow run succeeds or fails.` |
| `scripting` | `Re-runs the content script in already-open GitHub tabs right after install or update, so progress keeps updating without a page refresh.` |
| Host `https://api.github.com/*` | `Reads workflow runs, jobs and repository metadata from the GitHub REST API.` |
| Host `https://github.com/*` | `Signs the user in with GitHub's OAuth device flow (these endpoints are on github.com), and shows workflow progress inside GitHub pull request, code and Actions pages.` |

**Remote code**: `No, I am not using remote code.`

**Data usage** — 브라우저 안에서만 처리하는 데이터도 공개 대상이라([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)) 실제로 다루는 것을 모두 체크합니다.

| 항목 | 체크 | 근거 |
|---|---|---|
| Personally identifiable information | ✅ | GitHub 사용자 이름 저장 (내 run만 보기, 화면 표시) |
| Health information | — | |
| Financial and payment information | — | |
| Authentication information | ✅ | GitHub 액세스 토큰·갱신 토큰 저장 |
| Personal communications | — | |
| Location | — | |
| Web history | ✅ | github.com 페이지 주소로 보고 있는 저장소·PR·브랜치를 판별 |
| User activity | — | 클릭·입력 등을 기록하지 않음 |
| Website content | ✅ | 코드 화면에 보이는 최근 커밋 ID를 읽음 |

세 가지 인증 문구(판매하지 않음 / 핵심 기능과 무관한 용도로 쓰지 않음 / 신용 평가 용도로 쓰지 않음)는 모두 체크합니다.

**개인정보처리방침 URL**: https://github.com/gugitgugit/live-actions/blob/main/PRIVACY.md (저장소 공개 후)

## 첫 제출 때 한 일 (2026-10-08)

1. 저장소를 Public으로 전환 (개인정보처리방침·홈페이지 링크가 열려야 함)
2. GitHub App 설정: **Make public**, Homepage URL을 저장소 주소로, Description 입력
3. 개발자 등록 (최초 1회 $5): 게시자 이름 `gugitgugit`, EEA 사업자 선언은 비판매자(무료 개인 프로젝트), 연락처 이메일 인증
4. zip 업로드 → 위 내용 입력 → 심사 제출. 다음 날 승인·공개됨 (호스트 권한으로 "자세한 검토" 안내가 떴지만 하루 만에 통과)

업데이트는 버전을 올린 zip을 같은 항목의 **패키지**에 올리고 다시 제출합니다.

## 버전 기록

| 버전 | 공개일 | 내용 |
|---|---|---|
| 1.3.0 | 2026-11-12 | GitHub 새 PR Overview 화면 지원 |
| 1.2.1 | 2026-10-25 (제출 당일 승인) | 토큰 갱신 전 GitHub 연결 확인 (로그아웃 원인 수정) |
| 1.2.0 | 2026-10-24 (제출 당일 승인) | 화면의 커밋에서 도는 태그 등 다른 ref의 run 표시 |
| 1.1.2 | 2026-10-20 | 내려받은 업데이트를 바로 적용 |
| 1.1.1 | 2026-10-17 (제출 다음 날 승인) | 401에서 토큰 갱신 후 로그아웃, 인증 기록 |
| 1.1.0 | 2026-10-15 (제출 당일 승인) | 나란히 도는 job마다 진행 바 |
| 1.0.0 | 2026-10-09 (제출 다음 날 승인) | 첫 공개 |

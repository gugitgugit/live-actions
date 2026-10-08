# Live Actions for GitHub Privacy Policy

_Last updated: 2026-10-08_ · [한국어](#한국어)

Live Actions for GitHub is a browser extension that shows the progress of GitHub Actions workflow runs inside GitHub, in its toolbar popup and in desktop notifications. It has no server of its own: everything it keeps stays in your browser, and it talks only to GitHub.

## What the extension stores

All of the following is stored locally in your browser with `chrome.storage.local`:

- **Sign-in**: the GitHub access token (and its refresh token) from signing in with the Live Actions GitHub App, or a personal access token you enter, and your GitHub username
- **Settings**: the repositories you choose to be notified about, your notification preference and the other options on the settings page
- **Workflow data**: recent and running workflow runs of those repositories and of the repositories you are viewing on github.com (name, branch, commit, status, job and step progress), and copies of GitHub's responses kept so unchanged data is not fetched again
- **Timing history**: how long each job and step took in recent successful runs, used to estimate the time left; kept for up to 6 hours
- **Repository details**: the default branch of repositories you view, kept for up to a day, and the combined Actions status of commits shown in your open tabs
- **Status**: when GitHub was last checked, the last error, and the number of failures you have not seen yet

Signing out removes the sign-in, workflow data, timing history and repository details; your settings stay. Uninstalling the extension removes everything.

## Pages you visit on github.com

To show progress inside GitHub, the extension runs on github.com pages and reads the page address to tell which repository, pull request or branch you are looking at. On code pages it also reads the ID of the latest commit shown, to keep that commit's status icon current. It then asks GitHub's API for that repository's workflow runs with your token. Page addresses and commit IDs are sent nowhere else, and the extension reads nothing else from the pages you visit apart from finding where to place its progress bar. This can be turned off in the extension's settings.

When the extension is installed or updated, it re-runs this same code in github.com tabs that are already open, so they keep updating without a refresh.

## Where data is sent

The extension communicates only with GitHub (`api.github.com` and `github.com`), to sign you in and to read workflow run information. No data is sent to the developer or to any third party. There are no analytics, no tracking and no advertising, and no data is sold.

## Notifications

Desktop notifications show the workflow name, run title, repository, branch and duration. They are created by your browser on your device and can be turned off in the extension's settings.

## Access granted on GitHub

The GitHub App asks for read-only access to Actions and repository metadata. It cannot read or change your code, issues or pull requests. You choose which repositories the app may access when installing it, and you can revoke access at any time in GitHub's settings (Settings → Applications).

## Changes and contact

Changes to this policy are published in this file, with the date above updated. Questions: [open an issue](https://github.com/gugitgugit/live-actions/issues).

---

## 한국어

Live Actions for GitHub는 GitHub Actions 워크플로 진행 상황을 GitHub 화면 안, 툴바 팝업, 데스크톱 알림으로 보여주는 브라우저 확장 프로그램입니다. 별도 서버가 없어 저장하는 모든 것은 브라우저 안에 남고, GitHub하고만 통신합니다.

### 저장하는 정보

아래 정보는 모두 `chrome.storage.local`로 브라우저 안에만 저장됩니다.

- **로그인**: Live Actions GitHub App으로 로그인해 받은 GitHub 액세스 토큰(과 갱신 토큰) 또는 직접 입력한 개인 액세스 토큰, GitHub 사용자 이름
- **설정**: 알림을 받기로 고른 저장소, 알림 방식 등 설정 화면의 옵션
- **워크플로 정보**: 그 저장소들과 github.com에서 보고 있는 저장소의 실행 중·최근 워크플로 run(이름, 브랜치, 커밋, 상태, job·step 진행), 바뀌지 않은 데이터를 다시 받지 않기 위해 보관하는 GitHub 응답 사본
- **소요 시간 이력**: 남은 시간 예측에 쓰는 최근 성공 run의 job·step별 소요 시간, 최대 6시간 보관
- **저장소 정보**: 보고 있는 저장소의 기본 브랜치(최대 하루 보관), 열린 탭에 보이는 커밋의 Actions 합산 상태
- **상태**: 마지막 조회 시각, 마지막 오류, 아직 확인하지 않은 실패 수

로그아웃하면 로그인, 워크플로 정보, 소요 시간 이력, 저장소 정보가 지워지고 설정은 남습니다. 확장 프로그램을 삭제하면 전부 지워집니다.

### github.com에서 방문하는 페이지

GitHub 화면 안에 진행 상황을 표시하기 위해 github.com 페이지에서 동작하며, 페이지 주소를 읽어 어떤 저장소·PR·브랜치를 보고 있는지 판단합니다. 코드 화면에서는 그 커밋의 상태 아이콘을 최신으로 유지하기 위해 화면에 보이는 최근 커밋 ID도 읽습니다. 그다음 토큰으로 GitHub API에 해당 저장소의 워크플로 run을 요청합니다. 페이지 주소와 커밋 ID는 다른 곳으로 보내지 않으며, 진행 바를 넣을 위치를 찾는 것 외에는 페이지 내용을 읽지 않습니다. 이 기능은 설정에서 끌 수 있습니다.

설치하거나 업데이트할 때는 새로고침 없이 계속 갱신되도록, 이미 열려 있는 github.com 탭에서 같은 코드를 다시 실행합니다.

### 데이터를 보내는 곳

로그인과 워크플로 run 정보 조회를 위해 GitHub(`api.github.com`, `github.com`)하고만 통신합니다. 개발자나 제3자에게 어떤 데이터도 보내지 않습니다. 분석·추적·광고가 없고 데이터를 판매하지 않습니다.

### 알림

데스크톱 알림에는 워크플로 이름, run 제목, 저장소, 브랜치, 소요 시간이 표시됩니다. 알림은 기기에서 브라우저가 만들며, 설정에서 끌 수 있습니다.

### GitHub에서 허용하는 접근

GitHub App은 Actions와 저장소 메타데이터에 대한 읽기 전용 권한만 요청합니다. 코드, 이슈, PR을 읽거나 바꿀 수 없습니다. 앱을 설치할 때 접근할 저장소를 고를 수 있고, 언제든 GitHub 설정(Settings → Applications)에서 접근을 취소할 수 있습니다.

### 변경과 문의

이 방침이 바뀌면 이 파일에 반영하고 위 날짜를 갱신합니다. 문의: [이슈 남기기](https://github.com/gugitgugit/live-actions/issues)

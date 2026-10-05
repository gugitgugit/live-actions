# Actions Pulse Privacy Policy

_Last updated: 2026-10-01_

Actions Pulse is a browser extension that shows the progress of GitHub Actions workflow runs.

## What the extension stores

- **GitHub access token** (from signing in with the Actions Pulse GitHub App, or a personal access token you enter)
- **Your GitHub username**
- **The repositories you choose to watch** and your notification preferences
- **A short-lived cache** of workflow run and job data used to display progress

All of this is stored locally in your browser using `chrome.storage.local`. Signing out removes the token and cached run data.

## Where data is sent

The extension communicates only with GitHub (`api.github.com` and `github.com`) to authenticate you and read workflow run information. It has no server of its own. No data is sent to the developer or to any third party, and no analytics or tracking is used.

## Permissions

The GitHub App requests read-only access to Actions and repository metadata. It cannot read or modify your code, issues, or pull requests.

## Contact

Questions: open an issue on the project repository.

# Actions Pulse Privacy Policy

_Last updated: 2026-10-06_

Actions Pulse is a browser extension that shows the progress of GitHub Actions workflow runs.

## What the extension stores

- **GitHub access token** (from signing in with the Actions Pulse GitHub App, or a personal access token you enter)
- **Your GitHub username**
- **The repositories you choose to watch** and your notification preferences
- **A short-lived cache** of workflow run and job data used to display progress, and the default branch of repositories you view

All of this is stored locally in your browser using `chrome.storage.local`. Signing out removes the token and cached run data.

## Pages you visit on github.com

To show progress inside GitHub, the extension runs on github.com pages and reads the page address to tell which repository, pull request or branch you are looking at. It then requests that repository's workflow runs from GitHub with your token. Page addresses are not stored or sent anywhere else, and the extension does not read the content of the pages you visit beyond finding where to place its progress bar. This can be turned off in the extension's settings.

## Where data is sent

The extension communicates only with GitHub (`api.github.com` and `github.com`) to authenticate you and read workflow run information. It has no server of its own. No data is sent to the developer or to any third party, and no analytics or tracking is used.

## Permissions

The GitHub App requests read-only access to Actions and repository metadata. It cannot read or modify your code, issues, or pull requests.

## Contact

Questions: open an issue on the project repository.

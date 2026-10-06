import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'Actions Pulse',
  description: 'Watch GitHub Actions workflow progress at a glance — live progress bars, a badge and completion notifications.',
  version: pkg.version,
  icons,
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: icons,
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      // progress inside pull request, code and Actions pages; same origin as the existing host permission
      matches: ['https://github.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'alarms', 'notifications'],
  // api.github.com: REST API, github.com: OAuth device flow endpoints (no CORS headers there)
  host_permissions: ['https://api.github.com/*', 'https://github.com/*'],
})

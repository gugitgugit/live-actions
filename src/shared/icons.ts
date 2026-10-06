import { TONE_LABEL, type Tone } from '../lib/status'

// SVG markup shared by the React UI and the content script (which renders without React).
// Filled icons draw their glyph with --on-accent so they read on both themes.
const BODY: Record<Tone, string> = {
  running:
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>' +
    '<path class="spin" d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  queued:
    '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-dasharray="2.6 2.2"/>',
  success:
    '<circle cx="8" cy="8" r="7" fill="currentColor"/>' +
    '<path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="var(--on-accent, #fff)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  failure:
    '<circle cx="8" cy="8" r="7" fill="currentColor"/>' +
    '<path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="var(--on-accent, #fff)" stroke-width="1.7" stroke-linecap="round"/>',
  neutral:
    '<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M4 12L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
}

export function iconSvg(tone: Tone, size = 16): string {
  const label = TONE_LABEL[tone]
  return (
    `<svg class="icon icon-${tone}" width="${size}" height="${size}" viewBox="0 0 16 16" role="img" aria-label="${label}">` +
    `<title>${label}</title>${BODY[tone]}</svg>`
  )
}

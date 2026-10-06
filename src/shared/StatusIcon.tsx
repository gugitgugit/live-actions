import { iconSvg } from './icons'
import type { Tone } from '../lib/status'

export { toneOf, type Tone } from '../lib/status'

export function StatusIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  // markup is built from constants only, never from API data
  return <span className="icon-wrap" dangerouslySetInnerHTML={{ __html: iconSvg(tone, size) }} />
}

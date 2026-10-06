// Styles live inside each shadow root, so GitHub's CSS cannot reach in and ours cannot leak
// out. Colors come from GitHub's own Primer variables, which inherit through the shadow
// boundary, so the bar follows GitHub's light, dark and high-contrast themes.
export const STYLES = `
:host {
  display: block;
  --ap-fg: var(--fgColor-default, #1f2328);
  --ap-muted: var(--fgColor-muted, #59636e);
  --ap-accent: var(--fgColor-accent, #0969da);
  --ap-bar: var(--bgColor-accent-emphasis, #0969da);
  --ap-danger: var(--fgColor-danger, #d1242f);
  --ap-success: var(--fgColor-success, #1a7f37);
  --ap-attention: var(--fgColor-attention, #9a6700);
  --ap-bg: var(--bgColor-default, #ffffff);
  --ap-subtle: var(--bgColor-muted, #f6f8fa);
  --ap-border: var(--borderColor-default, #d1d9e0);
  --ap-track: var(--bgColor-neutral-muted, #818b981f);
  --on-accent: var(--ap-bg);
  color: var(--ap-fg);
  font-size: 12px;
  line-height: 1.5;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
a { color: inherit; text-decoration: none; }

.icon { display: inline-flex; flex: none; }
.icon-running { color: var(--ap-attention); }
.icon-queued { color: var(--ap-muted); }
.icon-success { color: var(--ap-success); }
.icon-failure { color: var(--ap-danger); }
.icon-neutral { color: var(--ap-muted); }
.spin { transform-origin: 8px 8px; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--ap-track);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 2px;
  background: var(--ap-bar);
  transition: width 0.9s linear;
}
.bar.failing .fill { background: var(--ap-danger); }
.bar.queued {
  background: repeating-linear-gradient(-45deg, var(--ap-track) 0 6px, transparent 6px 12px);
  background-size: 17px 17px;
  animation: stripes 1s linear infinite;
}
@keyframes stripes { to { background-position: 17px 0; } }

/* banner: sits between the repository tabs and the page content */
.banner {
  max-width: 1280px;
  margin: 16px auto 0;
  padding: 0 16px;
}
@media (min-width: 768px) { .banner { padding: 0 24px; } }
@media (min-width: 1012px) { .banner { padding: 0 32px; } }
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--ap-border);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: var(--ap-subtle);
  color: var(--ap-muted);
  font-weight: 600;
}
.spacer { flex: 1; }
.all { color: var(--ap-accent); font-weight: 400; }
.all:hover, .others:hover, .hint a:hover { text-decoration: underline; }
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ap-border);
  border-radius: 0 0 6px 6px;
  background: var(--ap-bg);
}
.list:empty { display: none; }
.row + .row { border-top: 1px solid var(--ap-border); }
.run { display: block; padding: 8px 12px; }
.run:hover { background: var(--ap-subtle); }
.top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.workflow { font-weight: 600; white-space: nowrap; }
.title {
  color: var(--ap-muted);
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta { color: var(--ap-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.row .bar { margin: 6px 0 0 24px; }
.others, .hint {
  display: block;
  margin: 6px 2px 0;
  color: var(--ap-muted);
}
.others { color: var(--ap-accent); }
.hint a { color: var(--ap-accent); }
.list:empty + .others, .list:empty ~ .hint { margin-top: 0; padding: 8px 12px; border: 1px solid var(--ap-border); border-radius: 0 0 6px 6px; }

/* code pages: inside GitHub's file list column, which already sets width and gutters */
:host(.inline) .banner { max-width: none; margin: 0 0 16px; padding: 0; }

/* floating fallback when GitHub's layout changed and the anchor is missing */
:host(.floating) {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: min(420px, calc(100vw - 32px));
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}
:host(.floating) .banner { margin: 0; padding: 0; }

/* compact bar inside an Actions list row */
.rowbar { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-left: 24px; }
.rowbar .bar { flex: 0 0 160px; }

@media (prefers-reduced-motion: reduce) {
  .spin, .bar.queued { animation: none; }
  .fill { transition: none; }
}
`

import { activeTheme } from '../services/personalization.js';

export default function ThemeToggle(personalization) {
  const theme = activeTheme(personalization);
  const custom = Boolean(theme.colors);
  const light = theme.mode === 'light';

  return `
    <button
      class="theme-toggle"
      id="theme-toggle"
      type="button"
      aria-label="${custom ? `Open settings for ${theme.name || 'Untitled theme'}` : `Switch to Atlas ${light ? 'dark' : 'light'}`}"
      ${custom ? 'data-open-settings' : `data-theme-switch="atlas-${light ? 'dark' : 'light'}"`}
    >
      <span class="theme-toggle-track" aria-hidden="true">
        <span class="theme-toggle-thumb"></span>
      </span>
      <span>${custom ? (theme.name || 'Untitled theme') : `Atlas ${light ? 'light' : 'dark'}`}</span>
    </button>`;
}

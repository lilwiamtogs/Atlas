export default function ThemeToggle(theme) {
  const light = theme === 'light';

  return `
    <button
      class="theme-toggle"
      id="theme-toggle"
      type="button"
      role="switch"
      aria-checked="${light}"
      aria-label="Use ${light ? 'dark' : 'light'} mode"
    >
      <span class="theme-toggle-track" aria-hidden="true">
        <span class="theme-toggle-thumb"></span>
      </span>
      <span>${light ? 'Light' : 'Dark'}</span>
    </button>`;
}

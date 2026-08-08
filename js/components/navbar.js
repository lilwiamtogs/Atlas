export default function Navbar(activeRoute) {
  return `
    <nav class="bottom-nav" aria-label="Primary navigation">
      <button class="nav-item ${activeRoute === 'home' ? 'is-active' : ''}" data-route="home" type="button">
        <span class="nav-ring" aria-hidden="true"></span>
        <span>Now</span>
      </button>
      <button class="nav-item ${activeRoute === 'schedule' ? 'is-active' : ''}" data-route="schedule" type="button">
        <span class="nav-ring" aria-hidden="true"></span>
        <span>Week</span>
      </button>
      <button class="nav-item ${activeRoute === 'import' ? 'is-active' : ''}" data-route="import" type="button">
        <span class="nav-ring" aria-hidden="true"></span>
        <span>Import</span>
      </button>
      <button class="nav-item mobile-settings-button" data-open-settings type="button" aria-label="Open settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>
      </button>
    </nav>`;
}

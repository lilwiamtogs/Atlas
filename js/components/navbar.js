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
    </nav>`;
}

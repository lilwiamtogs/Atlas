import Icon from './icon.js';

export default function Navbar(activeRoute) {
  return `
    <nav class="bottom-nav" aria-label="Primary navigation">
      <button class="nav-item ${activeRoute === 'home' ? 'is-active' : ''}" data-route="home" type="button">
        ${Icon('home')}
        <span>Now</span>
      </button>
      <button class="nav-item ${activeRoute === 'schedule' ? 'is-active' : ''}" data-route="schedule" type="button">
        ${Icon('calendar')}
        <span>Week</span>
      </button>
      <button class="nav-item ${activeRoute === 'import' ? 'is-active' : ''}" data-route="import" type="button">
        ${Icon('import')}
        <span>Import</span>
      </button>
    </nav>`;
}

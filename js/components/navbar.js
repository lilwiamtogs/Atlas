export default function Navbar(activeRoute) {
  return `
    <nav class="bottom-nav" aria-label="Primary navigation">
      <span class="nav-brand" aria-hidden="true">Atlas</span>
      <button class="nav-item ${activeRoute === 'home' ? 'is-active' : ''}" data-route="home" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
        <span>Now</span>
      </button>
      <button class="nav-item ${activeRoute === 'schedule' ? 'is-active' : ''}" data-route="schedule" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M8 3v4M16 3v4M3 10h18"></path></svg>
        <span>Week</span>
      </button>
      <button class="nav-item ${activeRoute === 'import' ? 'is-active' : ''}" data-route="import" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 12h8M12 8v8"></path></svg>
        <span>Import</span>
      </button>
      <span class="nav-context">Student planner</span>
    </nav>`;
}

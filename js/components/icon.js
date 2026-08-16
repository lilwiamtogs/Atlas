import { escapeHtml } from '../utils/html.js';

const ICONS = {
  home: '<path d="M3.5 10.5 12 3l8.5 7.5"></path><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6"></path>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M7 3v4M17 3v4M3 10h18"></path>',
  import: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"></path><path d="M4 14v6h16v-6"></path>',
  user: '<circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 20c.7-3.8 3.1-5.8 6.5-5.8s5.8 2 6.5 5.8"></path>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-2.9 1.3v.2h-4V21a1.7 1.7 0 0 0-2.9-1.3l-.1.1L4.2 17l.1-.1A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.3-2.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 2.9 1.3l.1-.1L19.8 7l-.1.1A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path>',
  help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.5 2.5 0 1 1 3.3 2.4c-.7.3-1 1-1 1.8v.3"></path><path d="M12 17.5h.01"></path>',
  'arrow-left': '<path d="m14.5 5-7 7 7 7"></path>',
  'arrow-right': '<path d="m9.5 5 7 7-7 7"></path>',
  close: '<path d="m6 6 12 12M18 6 6 18"></path>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  edit: '<path d="m14.5 5.5 4 4M4 20l1.2-5.2L16.8 3.2a1.7 1.7 0 0 1 2.4 0l1.6 1.6a1.7 1.7 0 0 1 0 2.4L9.2 18.8 4 20Z"></path>',
  trash: '<path d="M4 7h16M9 3h6l1 4M7 7l1 14h8l1-14M10 11v6M14 11v6"></path>',
  cloud: '<path d="M7.5 18.5H18a4 4 0 0 0 .5-8A6.5 6.5 0 0 0 6 9a4.8 4.8 0 0 0 1.5 9.5Z"></path>',
  bell: '<path d="M6 17h12l-1.3-1.8V10a4.7 4.7 0 0 0-9.4 0v5.2L6 17ZM10 20h4"></path>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path>',
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

export default function Icon(name, { className = '', label = '' } = {}) {
  const drawing = ICONS[name];
  if (!drawing) throw new Error(`Unknown Atlas icon: ${name}`);
  const accessibility = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return `<svg class="atlas-icon ${className}" viewBox="0 0 24 24" ${accessibility}>${drawing}</svg>`;
}

import { escapeHtml } from '../utils/html.js';
import { DAY_NAMES, formatTime } from '../utils/time.js';
import { Button } from './ui.js';

export default function ClassItem(item, options = {}) {
  const { current = false, finished = false, showDay = false, open = false, card = false, taskContent = '', navigate = false, fullPage = false } = options;
  const instructor = item.instructor
    ? `<p class="class-detail"><span>Instructor</span>${escapeHtml(item.instructor)}</p>`
    : '';
  const summaryContent = `
    <span class="class-marker" aria-hidden="true"></span>
    <span class="class-main">
      <span class="class-code">${escapeHtml(item.code)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="class-meta">${showDay ? `${DAY_NAMES[item.day]} · ` : ''}${formatTime(item.start)} — ${formatTime(item.end)}</span>
    </span>
    <span class="class-room">${escapeHtml(item.room)}</span>`;

  if (navigate) {
    return `
      <article class="atlas-card atlas-card--flush class-item class-card class-card-preview ${current ? 'is-current' : ''} ${finished ? 'is-finished' : ''}">
        <button class="class-card-summary" type="button" data-open-class="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.code)} details">
          ${summaryContent}
        </button>
        ${taskContent}
      </article>`;
  }

  return `
    <details class="class-item ${card ? 'atlas-card atlas-card--flush class-card' : ''} ${current ? 'is-current' : ''} ${finished ? 'is-finished' : ''} ${open ? 'is-expanded' : ''}" data-class-id="${escapeHtml(item.id)}" ${open ? 'open' : ''}>
      <summary>${summaryContent}</summary>
      <div class="class-details-reveal">
        <div class="class-details">
          <p class="class-detail"><span>Time</span>${formatTime(item.start)} — ${formatTime(item.end)}</p>
          <p class="class-detail"><span>Room</span>${escapeHtml(item.room) || 'Not set'}</p>
          ${instructor}
          ${taskContent}
          ${fullPage ? Button({ label: 'Open class page', variant: 'secondary', icon: 'arrow-right', iconAfter: true, className: 'secondary-action open-class-page', attributes: `data-open-class="${escapeHtml(item.id)}"` }) : ''}
        </div>
      </div>
    </details>`;
}

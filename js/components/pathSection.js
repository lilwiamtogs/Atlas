import { escapeHtml } from '../utils/html.js';

export default function PathSection(label, content, options = {}) {
  const { active = false, className = '' } = options;
  return `
    <section class="path-section ${active ? 'is-active' : ''} ${className}">
      <div class="path-heading">
        <span class="path-ring" aria-hidden="true"></span>
        <span class="path-line" aria-hidden="true"></span>
      </div>
      <p class="eyebrow">${escapeHtml(label)}</p>
      <div class="path-content">${content}</div>
    </section>`;
}

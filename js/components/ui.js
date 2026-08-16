import { escapeHtml } from '../utils/html.js';
import Icon from './icon.js';

const CARD_TAGS = new Set(['article', 'div', 'section']);
const BUTTON_VARIANTS = new Set(['primary', 'secondary', 'danger', 'quiet']);

export function Card(content, { tag = 'div', className = '', attributes = '', flush = false } = {}) {
  const safeTag = CARD_TAGS.has(tag) ? tag : 'div';
  return `<${safeTag} class="atlas-card ${flush ? 'atlas-card--flush' : ''} ${className}" ${attributes}>${content}</${safeTag}>`;
}

export function Button({ label, variant = 'primary', icon = '', iconAfter = false, className = '', type = 'button', attributes = '' }) {
  const safeVariant = BUTTON_VARIANTS.has(variant) ? variant : 'primary';
  const iconMarkup = icon ? Icon(icon) : '';
  const content = iconAfter
    ? `<span>${escapeHtml(label)}</span>${iconMarkup}`
    : `${iconMarkup}<span>${escapeHtml(label)}</span>`;
  return `<button class="atlas-button atlas-button--${safeVariant} ${className}" type="${type === 'submit' ? 'submit' : 'button'}" ${attributes}>${content}</button>`;
}

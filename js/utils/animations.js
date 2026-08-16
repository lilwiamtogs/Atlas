import Icon from '../components/icon.js';

const STRIKE_DURATION = 320;
const overlayStates = new WeakMap();
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

async function collapseRemoval(element) {
  if (!element?.isConnected || typeof element.animate !== 'function') return;
  const style = getComputedStyle(element);
  const startHeight = element.getBoundingClientRect().height;
  element.style.overflow = 'hidden';
  const collapse = element.animate([
    { height: `${startHeight}px`, marginTop: style.marginTop, marginBottom: style.marginBottom },
    { height: '0px', marginTop: '0px', marginBottom: '0px' },
  ], { duration: 190, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  try { await collapse.finished; } catch { /* A rerender can cancel safely. */ }
}

export async function transitionStrikeRemoval(element) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.classList.add('is-striking');
  await wait(STRIKE_DURATION);
  if (typeof element.animate !== 'function') return;
  const animation = element.animate([
    { transform: 'translateX(0)', opacity: 1 },
    { transform: 'translateX(12px)', opacity: 0 },
  ], { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  try {
    await animation.finished;
  } catch {
    // A route change can cancel the animation safely.
  }
  await collapseRemoval(element);
}

export async function transitionTaskRow(row, completing) {
  if (!row || window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof row.animate !== 'function') {
    return;
  }

  row.classList.add(completing ? 'is-completing' : 'is-restoring');
  const check = row.querySelector('.task-check');
  if (check) {
    check.setAttribute('aria-pressed', String(completing));
    const mark = check.querySelector('span');
    if (mark) mark.innerHTML = completing ? Icon('check') : '';
  }
  if (completing) {
    row.classList.add('is-striking');
    await wait(STRIKE_DURATION);
  }
  const animation = row.animate([
    { transform: 'translateX(0) scale(1)', opacity: 1 },
    { transform: `translateX(${completing ? '14px' : '-14px'}) scale(0.985)`, opacity: 0 },
  ], {
    duration: 280,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'forwards',
  });

  try {
    await animation.finished;
  } catch {
    // A rerender can cancel the animation safely.
  }
  if (completing) await collapseRemoval(row);
}

export async function transitionAddConfirmation(element) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof element.animate !== 'function') return;
  element.querySelector('[type="submit"]')?.classList.add('is-confirming');
  const animation = element.animate([
    { transform: 'translateY(0)', filter: 'brightness(1)' },
    { transform: 'translateY(-4px)', filter: 'brightness(1.08)', offset: .45 },
    { transform: 'translateY(0)', filter: 'brightness(1)' },
  ], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
  try { await animation.finished; } catch { /* A rerender can cancel safely. */ }
}

export async function transitionClassDisclosure(card, opening) {
  if (!card || card.dataset.animating === 'true') return;
  const reveal = card.querySelector(':scope > .class-details-reveal');
  const summary = card.querySelector(':scope > summary');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reveal || !summary || reduceMotion || typeof card.animate !== 'function') {
    card.open = opening;
    card.classList.toggle('is-expanded', opening);
    return;
  }

  // Height interpolation forces layout on every frame and is noticeably choppy
  // on phones. Let layout settle once, then reveal the content on the compositor.
  if (window.matchMedia('(max-width: 619px), (pointer: coarse)').matches) {
    card.dataset.animating = 'true';
    const startHeight = card.getBoundingClientRect().height;
    if (opening) {
      card.open = true;
      card.classList.add('is-expanded');
    }
    const cardStyle = getComputedStyle(card);
    const collapsedHeight = summary.getBoundingClientRect().height
      + Number.parseFloat(cardStyle.borderTopWidth || 0)
      + Number.parseFloat(cardStyle.borderBottomWidth || 0);
    const animation = reveal.animate(
      opening
        ? [{ opacity: 0, transform: 'translateY(-8px)', clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0)' }]
        : [{ opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0)' }, { opacity: 0, transform: 'translateY(-6px)', clipPath: 'inset(0 0 100% 0)' }],
      { duration: opening ? 190 : 150, easing: opening ? 'cubic-bezier(.22,1,.36,1)' : 'ease-in', fill: 'both' },
    );
    const endHeight = opening ? card.scrollHeight : collapsedHeight;
    card.style.overflow = 'hidden';
    const heightAnimation = card.animate(
      [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
      { duration: opening ? 220 : 170, easing: opening ? 'cubic-bezier(.22,1,.36,1)' : 'cubic-bezier(.4,0,1,1)', fill: 'both' },
    );
    try { await Promise.all([animation.finished, heightAnimation.finished]); } catch { /* A rerender can cancel safely. */ }
    if (!opening) {
      card.open = false;
      card.classList.remove('is-expanded');
    }
    animation.cancel();
    heightAnimation.cancel();
    card.style.removeProperty('overflow');
    delete card.dataset.animating;
    return;
  }

  card.dataset.animating = 'true';
  const startHeight = card.getBoundingClientRect().height;
  if (opening) {
    card.open = true;
    card.classList.add('is-expanded');
  }
  const cardStyle = getComputedStyle(card);
  const collapsedHeight = summary.getBoundingClientRect().height
    + Number.parseFloat(cardStyle.borderTopWidth || 0)
    + Number.parseFloat(cardStyle.borderBottomWidth || 0);
  const endHeight = opening ? card.scrollHeight : collapsedHeight;
  card.style.height = `${startHeight}px`;
  card.style.overflow = 'hidden';

  const heightAnimation = card.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 230, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
  );
  const contentAnimation = reveal.animate(
    opening
      ? [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }]
      : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }],
    { duration: opening ? 190 : 145, easing: opening ? 'ease-out' : 'ease-in', fill: 'both' },
  );

  try {
    await Promise.all([heightAnimation.finished, contentAnimation.finished]);
  } catch {
    // A rerender can safely cancel this visual transition.
  }
  if (!opening) {
    card.open = false;
    card.classList.remove('is-expanded');
  }
  card.style.height = `${endHeight}px`;
  heightAnimation.cancel();
  card.getBoundingClientRect();
  card.style.removeProperty('height');
  card.style.removeProperty('overflow');
  contentAnimation.cancel();
  delete card.dataset.animating;
}

function syncBackgroundInert() {
  const modalOpen = Boolean(document.querySelector('.is-visible:not(.is-closing) [aria-modal="true"], [aria-modal="true"].is-visible:not(.is-closing)'));
  document.querySelectorAll('#main-content, .app-controls, .nav-dock, .developer-panel').forEach((region) => {
    if (modalOpen && !region.closest('.is-visible')) region.setAttribute('inert', '');
    else region.removeAttribute('inert');
  });
}

function focusableElements(element) {
  return [...element.querySelectorAll(FOCUSABLE)].filter((item) => !item.hidden && item.getClientRects().length);
}

function finishOverlayClose(element) {
  const state = overlayStates.get(element);
  state?.keydown && element.removeEventListener('keydown', state.keydown);
  overlayStates.delete(element);
  element.classList.remove('is-visible');
  element.setAttribute('aria-hidden', 'true');
  syncBackgroundInert();
  if (state?.previousFocus?.isConnected) state.previousFocus.focus({ preventScroll: true });
  state?.resolveClosing?.();
}

export async function closeOverlay(element, duration = 240) {
  if (!element) return;
  if (duration === 240 && element.matches('.install-gate, .tutorial-screen')) duration = 280;
  const existingState = overlayStates.get(element) || {};
  if (element.classList.contains('is-closing')) {
    await existingState.closingDone;
    return;
  }
  existingState.closingDone = new Promise((resolve) => { existingState.resolveClosing = resolve; });
  overlayStates.set(element, existingState);
  element.getBoundingClientRect();
  element.classList.add('is-closing');
  const state = overlayStates.get(element);
  state?.animations?.forEach((animation) => animation.cancel());
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishOverlayClose(element);
    return;
  }

  if (typeof element.animate !== 'function') {
    await wait(duration);
    finishOverlayClose(element);
    return;
  }

  const panel = element.firstElementChild;
  const overlayOpacity = getComputedStyle(element).opacity;
  const panelStyle = panel ? getComputedStyle(panel) : null;
  const overlayAnimation = element.animate(
    [{ opacity: overlayOpacity }, { opacity: 0 }],
    { duration, easing: 'ease-in', fill: 'forwards' },
  );
  const panelAnimation = panel?.animate(
    [
      { transform: panelStyle?.transform === 'none' ? 'translateY(0) scale(1)' : panelStyle?.transform, opacity: panelStyle?.opacity || 1 },
      { transform: 'translateY(24px) scale(.985)', opacity: 0 },
    ],
    { duration, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );

  await Promise.race([
    Promise.allSettled([overlayAnimation.finished, panelAnimation?.finished].filter(Boolean)),
    wait(duration + 120),
  ]);
  finishOverlayClose(element);
}

export function openOverlay(element, duration = 260) {
  if (!element) return;
  element.classList.remove('is-closing');
  element.removeAttribute('aria-hidden');
  element.classList.add('is-visible');
  const panel = element.firstElementChild;
  const dialog = element.matches('[aria-modal="true"]') ? element : element.querySelector('[aria-modal="true"]') || panel;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const keydown = (event) => {
    if (event.key === 'Escape') {
      const closeControl = element.querySelector('[data-overlay-close]');
      if (closeControl) {
        event.preventDefault();
        closeControl.click();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(dialog || element);
    if (!focusable.length) {
      event.preventDefault();
      dialog?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  element.addEventListener('keydown', keydown);
  dialog?.setAttribute('tabindex', '-1');
  const animations = [];
  overlayStates.set(element, { previousFocus, keydown, animations });
  syncBackgroundInert();

  if (duration > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof element.animate === 'function') {
    animations.push(element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: duration - 40,
      easing: 'ease-out',
      fill: 'both',
    }));
    if (panel) animations.push(panel.animate(
      [{ transform: 'translateY(24px) scale(.985)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
      { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    ));
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => animations.forEach((animation) => animation.cancel()));
  }

  if (duration > 0) requestAnimationFrame(() => {
    const preferred = element.querySelector('[autofocus], [data-overlay-close], input:not([type="hidden"]), button:not([disabled])');
    (preferred || dialog)?.focus({ preventScroll: true });
  });
}

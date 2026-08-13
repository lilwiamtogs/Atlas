const STRIKE_DURATION = 320;

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
    if (mark) mark.textContent = completing ? '✓' : '';
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
    const closeHeight = opening ? null : card.animate(
      [{ height: `${startHeight}px` }, { height: `${collapsedHeight}px` }],
      { duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'both' },
    );
    if (closeHeight) card.style.overflow = 'hidden';
    try { await Promise.all([animation.finished, closeHeight?.finished].filter(Boolean)); } catch { /* A rerender can cancel safely. */ }
    if (!opening) {
      card.open = false;
      card.classList.remove('is-expanded');
    }
    animation.cancel();
    closeHeight?.cancel();
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

export async function closeOverlay(element, duration = 260) {
  if (!element) return;
  if (duration === 260 && element.matches('.install-gate, .tutorial-screen')) duration = 280;
  if (element.classList.contains('is-closing')) return;
  // Commit the fully-open frame before swapping to the exit animation. Without
  // this read, a fast click can let the browser coalesce both visual states.
  element.getBoundingClientRect();
  element.classList.add('is-closing');
  element.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (typeof element.animate !== 'function') {
    await wait(duration);
    return;
  }

  const panel = element.firstElementChild;
  const overlayAnimation = element.animate(
    [
      { opacity: 1 },
      { opacity: 0 },
    ],
    { duration, easing: 'ease-in', fill: 'forwards' },
  );
  const panelAnimation = panel?.animate(
    [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(36px)', opacity: 0 }],
    { duration, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );

  await Promise.race([
    Promise.allSettled([overlayAnimation.finished, panelAnimation?.finished].filter(Boolean)),
    wait(duration + 120),
  ]);
}

export function openOverlay(element, duration = 260) {
  if (!element) return;
  element.classList.add('is-visible');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof element.animate !== 'function') return;
  const panel = element.firstElementChild;
  element.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration,
    easing: 'ease-out',
    fill: 'both',
  });
  panel?.animate([{ transform: 'translateY(36px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], {
    duration,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'both',
  });
}

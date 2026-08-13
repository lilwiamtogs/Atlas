const STRIKE_DURATION = 320;

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
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
    { duration: 230, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
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
  card.style.removeProperty('height');
  card.style.removeProperty('overflow');
  contentAnimation.cancel();
  delete card.dataset.animating;
}

export async function closeOverlay(element, duration = 300) {
  if (!element) return;
  if (element.classList.contains('is-closing')) return;
  // Commit the fully-open frame before swapping to the exit animation. Without
  // this read, a fast click can let the browser coalesce both visual states.
  element.getBoundingClientRect();
  element.classList.add('is-closing');
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
    [
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(18px) scale(0.975)', opacity: 0 },
    ],
    { duration, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );

  await Promise.race([
    Promise.allSettled([overlayAnimation.finished, panelAnimation?.finished].filter(Boolean)),
    wait(duration + 120),
  ]);
}

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

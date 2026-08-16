const greetings = [
  'hi :)',
  'yo',
  'welcome',
  "what's up?",
  'welcome back',
  'good to see u',
  'ur back!',
  'back at it?',
  'welcome, what’s up?',
  'hey, ready?',
];

export function showWelcomeScreen({ fromSplash = false } = {}) {
  document.documentElement.classList.add('atlas-welcoming');
  const screen = document.createElement('div');
  const name = localStorage.getItem('atlas.profileSignedIn') === 'true' ? String(localStorage.getItem('atlas.profileName') || '').trim() : '';
  const namedGreetings = name ? [`welcome back, ${name}`, `hey ${name} :)`, `good to see u, ${name}`, `${name}, ready?`] : [];
  const useName = namedGreetings.length && Math.random() < 0.48;
  const greetingPool = useName ? namedGreetings : greetings;
  const greeting = greetingPool[Math.floor(Math.random() * greetingPool.length)];

  screen.className = `welcome-screen${fromSplash ? ' is-from-native-splash' : ''}`;
  screen.setAttribute('aria-label', greeting);
  screen.innerHTML = `
    <div class="welcome-icon-stage" aria-hidden="true">
      <img src="assets/icons/atlas-maskable.png" alt="">
    </div>
    <div class="welcome-mark">
      <p></p>
    </div>`;
  screen.querySelector('.welcome-mark p').textContent = greeting;
  document.body.append(screen);

  return screen;
}

export async function hideWelcomeScreen(screen) {
  if (!screen) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  screen.classList.add('is-leaving');

  if (!reduceMotion) {
    const compactScreen = window.matchMedia('(max-width: 619px), (pointer: coarse)').matches;
    await new Promise((resolve) => window.setTimeout(resolve, compactScreen ? 340 : 380));
  }

  screen.remove();
  document.documentElement.classList.remove('atlas-welcoming');
}

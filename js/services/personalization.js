const PERSONALIZATION_KEY = 'atlas.personalization';
const DEFAULT_COLORS = { accent: '#7a9e87', highlight: '#a9c8b3', background: '#0f1512', transition1: '#7a9e87', transition2: '#a9c8b3', transition3: '#587662' };

export const BUILT_IN_THEMES = Object.freeze([
  { id: 'atlas-dark', name: 'Atlas dark', mode: 'dark' },
  { id: 'atlas-light', name: 'Atlas light', mode: 'light' },
]);

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
}

function normalizeSavedTheme(theme, index) {
  const colors = theme?.colors || {};
  return {
    id: String(theme?.id || `custom-${index}`).slice(0, 80),
    name: String(theme?.name || '').trim().slice(0, 32),
    mode: theme?.mode === 'light' ? 'light' : theme?.mode === 'custom' ? 'custom' : 'dark',
    colors: {
      accent: color(colors.accent, DEFAULT_COLORS.accent),
      highlight: color(colors.highlight, DEFAULT_COLORS.highlight),
      background: color(colors.background, DEFAULT_COLORS.background),
      transition1: color(colors.transition1, colors.accent || DEFAULT_COLORS.transition1),
      transition2: color(colors.transition2, colors.highlight || DEFAULT_COLORS.transition2),
      transition3: color(colors.transition3, colors.transition || DEFAULT_COLORS.transition3),
    },
  };
}

export function normalizePersonalization(value = {}) {
  const legacyTheme = value.themeName || value.colors
    ? [normalizeSavedTheme({ id: 'custom-legacy', name: value.themeName, colors: value.colors, mode: localStorage.getItem('atlas.theme') }, 0)]
    : [];
  const savedThemes = (Array.isArray(value.savedThemes) ? value.savedThemes : legacyTheme)
    .slice(0, 12).map(normalizeSavedTheme);
  const validIds = new Set([...BUILT_IN_THEMES.map((theme) => theme.id), ...savedThemes.map((theme) => theme.id)]);
  const requestedId = String(value.activeThemeId || (savedThemes.length ? savedThemes[0].id : `atlas-${localStorage.getItem('atlas.theme') === 'light' ? 'light' : 'dark'}`));
  return {
    activeThemeId: validIds.has(requestedId) ? requestedId : 'atlas-dark',
    savedThemes,
    draftColors: normalizeSavedTheme({ colors: value.draftColors || value.colors }, 0).colors,
    focusMode: Boolean(value.focusMode),
    openingPage: value.openingPage === 'schedule' ? 'schedule' : 'home',
  };
}

export function activeTheme(value) {
  const personalization = normalizePersonalization(value);
  return BUILT_IN_THEMES.find((theme) => theme.id === personalization.activeThemeId)
    || personalization.savedThemes.find((theme) => theme.id === personalization.activeThemeId)
    || BUILT_IN_THEMES[0];
}

export function loadPersonalization() {
  try { return normalizePersonalization(JSON.parse(localStorage.getItem(PERSONALIZATION_KEY) || '{}')); }
  catch { return normalizePersonalization(); }
}

export function applyPersonalization(value) {
  const personalization = normalizePersonalization(value);
  const selected = activeTheme(personalization);
  const root = document.documentElement;
  root.dataset.theme = selected.mode === 'light' ? 'light' : 'dark';
  localStorage.setItem('atlas.theme', selected.mode === 'light' ? 'light' : 'dark');
  const variables = ['--primary', '--primary-light', '--display-text', '--bg', '--surface', '--surface-2', '--atmosphere-line', '--transition-primary', '--transition-secondary', '--transition-tertiary'];
  variables.forEach((property) => root.style.removeProperty(property));
  if (selected.colors) {
    root.style.setProperty('--primary', selected.colors.accent);
    root.style.setProperty('--primary-light', selected.colors.highlight);
    root.style.setProperty('--display-text', selected.colors.highlight);
    root.style.setProperty('--bg', selected.colors.background);
    root.style.setProperty('--surface', `color-mix(in srgb, ${selected.colors.background} 92%, ${selected.colors.highlight})`);
    root.style.setProperty('--surface-2', `color-mix(in srgb, ${selected.colors.background} 84%, ${selected.colors.highlight})`);
    root.style.setProperty('--atmosphere-line', selected.colors.transition3);
    root.style.setProperty('--transition-primary', selected.colors.transition1);
    root.style.setProperty('--transition-secondary', selected.colors.transition2);
    root.style.setProperty('--transition-tertiary', selected.colors.transition3);
  }
  root.dataset.focusMode = String(personalization.focusMode);
  return personalization;
}

export function savePersonalization(value) {
  const personalization = normalizePersonalization(value);
  localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(personalization));
  applyPersonalization(personalization);
  return personalization;
}

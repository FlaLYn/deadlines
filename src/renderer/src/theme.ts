export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'deadlines-theme';

/** Machine-level preference, so it applies before any account is known. */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A blocked storage API shouldn't stop the theme applying for this session.
  }
  applyTheme(theme);
}

/** Keeps "system" honest when macOS flips appearance while the app is open. */
export function watchSystemTheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (): void => {
    if (readTheme() === 'system') applyTheme('system');
  };
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

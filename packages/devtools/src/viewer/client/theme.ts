export const THEME_STORAGE_KEY = 'ai-sdk-devtools-theme';

export type Theme = 'dark' | 'light';

type ThemeRoot = {
  dataset: DOMStringMap;
  classList: Pick<DOMTokenList, 'toggle'>;
  style: Pick<CSSStyleDeclaration, 'colorScheme'>;
};

type ThemeStorageReader = Pick<Storage, 'getItem'>;
type ThemeStorageWriter = Pick<Storage, 'setItem'>;

export function getStoredTheme(storage?: ThemeStorageReader): Theme {
  try {
    const storedTheme = storage?.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme, root: ThemeRoot): void {
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function setTheme({
  theme,
  root,
  storage,
}: {
  theme: Theme;
  root: ThemeRoot;
  storage?: ThemeStorageWriter;
}): void {
  applyTheme(theme, root);

  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme selection still applies when storage is unavailable.
  }
}

export function initializeTheme({
  root,
  storage,
}: {
  root: ThemeRoot;
  storage?: ThemeStorageReader;
}): Theme {
  const theme = getStoredTheme(storage);
  applyTheme(theme, root);
  return theme;
}

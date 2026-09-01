import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './components/theme-toggle';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  initializeTheme,
  setTheme,
} from './theme';

function createThemeRoot() {
  const classes = new Set<string>();
  const root = {
    dataset: {} as DOMStringMap,
    classList: {
      toggle: (token: string, force?: boolean) => {
        const shouldInclude = force ?? !classes.has(token);
        if (shouldInclude) {
          classes.add(token);
        } else {
          classes.delete(token);
        }
        return shouldInclude;
      },
    },
    style: {
      colorScheme: '',
    },
  };

  return { classes, root };
}

describe('viewer theme', () => {
  it('uses the existing dark theme by default', () => {
    expect(getStoredTheme()).toBe('dark');
    expect(
      getStoredTheme({
        getItem: () => 'unsupported-theme',
      }),
    ).toBe('dark');
  });

  it('initializes the persisted light theme', () => {
    const { classes, root } = createThemeRoot();

    const theme = initializeTheme({
      root,
      storage: {
        getItem: () => 'light',
      },
    });

    expect(theme).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(classes.has('dark')).toBe(false);
  });

  it('applies and persists theme changes', () => {
    const { classes, root } = createThemeRoot();
    const setItem = vi.fn();

    setTheme({
      theme: 'dark',
      root,
      storage: {
        setItem,
      },
    });

    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(classes.has('dark')).toBe(true);
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
  });

  it('still applies the theme when storage is unavailable', () => {
    const { root } = createThemeRoot();

    expect(() =>
      setTheme({
        theme: 'light',
        root,
        storage: {
          setItem: () => {
            throw new Error('unavailable');
          },
        },
      }),
    ).not.toThrow();

    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
  });

  it('updates the document theme class', () => {
    const { classes, root } = createThemeRoot();

    applyTheme('dark', root);
    expect(classes.has('dark')).toBe(true);

    applyTheme('light', root);
    expect(classes.has('dark')).toBe(false);
  });

  it('renders an accessible native theme toggle', () => {
    const onThemeChange = vi.fn();
    const control = ThemeToggle({
      theme: 'dark',
      onThemeChange,
    }) as ReactElement<{ onClick: () => void }>;

    control.props.onClick();
    expect(onThemeChange).toHaveBeenCalledWith('light');

    const html = renderToStaticMarkup(
      createElement(ThemeToggle, {
        theme: 'dark',
        onThemeChange,
      }),
    );

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Use light theme"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('title="Switch to light theme"');
  });
});

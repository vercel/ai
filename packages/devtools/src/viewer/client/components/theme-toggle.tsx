import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../theme';
import { Button } from './ui/button';

export function ThemeToggle({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const title = `Switch to ${nextTheme} theme`;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label="Use light theme"
      aria-pressed={theme === 'light'}
      title={title}
      onClick={() => onThemeChange(nextTheme)}
    >
      {theme === 'dark' ? (
        <Sun className="size-3.5" />
      ) : (
        <Moon className="size-3.5" />
      )}
      <span className="sr-only">Use light theme</span>
    </Button>
  );
}

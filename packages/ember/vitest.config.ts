import { babel } from '@rollup/plugin-babel';
import { ember, extensions } from '@embroider/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * The tests render Ember components in a real browser,
 * because that is where an Ember app runs.
 *
 * `channel: 'chrome'` uses the installed Google Chrome,
 * so no Playwright browser download is needed.
 */
export default defineConfig({
  plugins: [
    ember(),
    babel({
      babelHelpers: 'inline',
      extensions,
    }),
  ],
  test: {
    include: ['tests/**/*.test.gts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { channel: 'chrome' },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});

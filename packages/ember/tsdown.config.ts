import { defineConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig({
  ...tsdownBaseConfig,
  /**
   * `@ember/*` and `@glimmer/*` modules come from the app's `ember-source`.
   */
  deps: { neverBundle: [/^@ember\//, /^@glimmer\//] },
});

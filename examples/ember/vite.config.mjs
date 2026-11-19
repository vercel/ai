import { babel } from '@rollup/plugin-babel';
import { ember, extensions } from '@embroider/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    ember(),
    babel({
      babelHelpers: 'inline',
      extensions,
    }),
  ],
  server: {
    proxy: {
      /**
       * `src/server.ts` serves the AI endpoints on port 3000.
       */
      '/api': 'http://127.0.0.1:3000',
    },
  },
});

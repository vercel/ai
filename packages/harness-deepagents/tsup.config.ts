import { defineConfig } from 'tsup';

// Only the host-side adapter is compiled by tsup. The agent runtime is a
// Python bridge (`src/bridge/*.py`) that runs inside the sandbox; its files are
// shipped verbatim via the `copy-bridge-assets` script and its dependencies are
// installed in-sandbox from `requirements.txt` at bootstrap time — they are
// never bundled here.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
  },
]);

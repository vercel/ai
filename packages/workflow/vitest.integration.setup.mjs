import { readFile, writeFile } from 'node:fs/promises';

// @workflow/vitest emits an ESM step bundle that can contain bundled CommonJS
// dependencies. Give those dependencies a require scoped to the generated file.
const stepsBundleUrl = new URL('./.workflow-vitest/steps.mjs', import.meta.url);
const stepsBundle = await readFile(stepsBundleUrl, 'utf8');
const requireBanner = `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n`;

if (!stepsBundle.startsWith(requireBanner)) {
  await writeFile(stepsBundleUrl, `${requireBanner}${stepsBundle}`);
}

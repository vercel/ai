#!/usr/bin/env node

import { runVerifier } from '../../tools/verifiers/api.ts';
import { readTextFile } from '../../tools/verifiers/utils.ts';

/**
 * Catalogs that still derive capabilities from parsed model versions. Remove a
 * file from this list once its entries declare those capabilities directly.
 * Never add a file to it.
 */
const pendingMigration = new Set([
  'packages/alibaba/src/alibaba-model-catalog.ts',
  'packages/google/src/google-model-catalog.ts',
  'packages/minimax/src/minimax-model-catalog.ts',
  'packages/openai/src/openai-model-catalog.ts',
]);

const ordering = String.raw`(?:>=|<=|>|<)`;
const versionValue = String.raw`\b\w*(?:version|major|minor)\w*(?:\??\.\w+|\??\.?\[\d+\])*`;
const parsedNumber = String.raw`\b(?:Number|parseInt|parseFloat)\([^()]*(?:match|exec|version|major|minor|\[\d+\])[^()]*\)`;

/**
 * Ordered numeric comparisons on a parsed model version, such as
 * `gptVersion.major >= 5` or `Number(match[1]) >= 3`, select capabilities by
 * model generation (CAP-1).
 */
const versionComparisons = [
  new RegExp(String.raw`${versionValue}\s*${ordering}\s*\d`, 'i'),
  new RegExp(String.raw`\d\s*${ordering}\s*${versionValue}`, 'i'),
  new RegExp(String.raw`${parsedNumber}\s*${ordering}\s*\d`, 'i'),
];

await runVerifier(async ({ files, reportViolation }) => {
  for (const file of files) {
    if (pendingMigration.has(file)) continue;

    const source = stripComments(await readTextFile(file));
    if (versionComparisons.some(pattern => pattern.test(source))) {
      reportViolation({ file, violationCode: 'CAP-1' });
    }
  }
});

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

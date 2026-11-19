#!/usr/bin/env node

import { runVerifier } from '../../tools/verifiers/api.ts';
import { readTextFile } from '../../tools/verifiers/utils.ts';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;

await runVerifier(async ({ files, reportViolation }) => {
  const aiManifest = JSON.parse(await readTextFile('packages/ai/package.json'));
  const referenceVersion = aiManifest.devDependencies?.zod;

  if (
    typeof referenceVersion !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(referenceVersion)
  ) {
    throw new Error(
      'Expected an exact zod version in the devDependencies of packages/ai/package.json.',
    );
  }

  const allowedSpecifiers = new Set([referenceVersion, `^${referenceVersion}`]);

  for (const file of files) {
    const manifest = JSON.parse(await readTextFile(file));

    for (const field of DEPENDENCY_FIELDS) {
      const specifier = manifest[field]?.zod;
      if (specifier !== undefined && !allowedSpecifiers.has(specifier)) {
        reportViolation({ file, violationCode: 'ZOD-1' });
      }
    }
  }
});

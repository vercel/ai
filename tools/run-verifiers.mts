#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getApplicableGuidelines,
  getInputFiles,
} from './verifiers/internal/discovery.ts';
import { fileExists, logError, logMessage } from './verifiers/utils.ts';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

try {
  const inputFiles: string[] = [];
  for (const file of getInputFiles({ defaultPaths: ['.'] })) {
    if (await fileExists(file)) inputFiles.push(file);
  }
  const verifiers: { verifierFile: string; files: string[] }[] = [];
  for (const { guidelineFile, files } of await getApplicableGuidelines(
    inputFiles,
  )) {
    const verifierFile = `.agents/verifiers/${basename(guidelineFile, '.md')}.ts`;
    if (await fileExists(verifierFile)) {
      verifiers.push({ verifierFile, files });
    }
  }

  if (verifiers.length === 0) {
    logMessage('No applicable verifiers found.');
  } else {
    logMessage('Verifier results:');
    let exitCode = 0;
    for (const { verifierFile, files } of verifiers) {
      const result = spawnSync(
        resolve(repoRoot, verifierFile),
        files.flatMap(file => ['--file', file]),
        { cwd: repoRoot, stdio: 'inherit' },
      );
      if (result.error != null) throw result.error;
      if (result.signal != null) {
        throw new Error(
          `Verifier "${verifierFile}" terminated with signal ${result.signal}.`,
        );
      }
      if (result.status === 2) {
        exitCode = 2;
      } else if (result.status !== 0 && exitCode !== 2) {
        exitCode = 1;
      }
    }

    if (exitCode === 2) {
      logError(
        'You must fix these violations. Refer to the referenced guideline files for more information.',
      );
    }
    process.exitCode = exitCode;
  }
} catch (error) {
  logError(error);
  process.exitCode = 1;
}

#!/usr/bin/env node

import { globSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVerifier } from '../../tools/verifiers/api.ts';
import { readTextFile } from '../../tools/verifiers/utils.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

await runVerifier(async ({ reportViolation }) => {
  const guidelineNames = new Set<string>();
  const guidelineByAcronym = new Map<string, string>();

  for (const file of globSync('.agents/guidelines/**/*.md', {
    cwd: repoRoot,
  }).sort()) {
    if (file === '.agents/guidelines/_TEMPLATE.md') continue;
    if (!statSync(resolve(repoRoot, file)).isFile()) continue;
    if (dirname(file) === '.agents/guidelines') {
      guidelineNames.add(basename(file, '.md'));
    } else {
      reportViolation({ file, violationCode: 'GV-1' });
    }

    const ruleNumbers = new Set<string>();
    const acronyms = new Set<string>();
    for (const heading of getLevelTwoHeadings(await readTextFile(file))) {
      const rule = heading.match(/^([A-Z]+)-([1-9][0-9]*):[ \t]+\S/);
      if (rule == null) {
        reportViolation({ file, violationCode: 'GV-2' });
        continue;
      }

      const [, acronym, number] = rule;
      if (ruleNumbers.has(number)) {
        reportViolation({ file, violationCode: 'GV-2' });
      }
      ruleNumbers.add(number);
      acronyms.add(acronym);
    }

    if (acronyms.size !== 1) {
      reportViolation({ file, violationCode: 'GV-2' });
    }
    for (const acronym of acronyms) {
      const firstFile = guidelineByAcronym.get(acronym);
      if (firstFile == null) {
        guidelineByAcronym.set(acronym, file);
      } else {
        reportViolation({ file: firstFile, violationCode: 'GV-2' });
        reportViolation({ file, violationCode: 'GV-2' });
      }
    }
  }

  for (const file of globSync('.agents/verifiers/**/*.ts', {
    cwd: repoRoot,
  }).sort()) {
    const stat = statSync(resolve(repoRoot, file));
    if (!stat.isFile()) continue;
    if (
      dirname(file) !== '.agents/verifiers' ||
      !guidelineNames.has(basename(file, '.ts')) ||
      (stat.mode & 0o100) === 0
    ) {
      reportViolation({ file, violationCode: 'GV-3' });
    }
  }
});

function* getLevelTwoHeadings(source: string): Generator<string> {
  let fence: string | undefined;

  for (const line of source.split(/\r\n?|\n/)) {
    if (fence != null) {
      const closingFence = line.match(/^ {0,3}(`+|~+)[ \t]*$/)?.[1];
      if (
        closingFence != null &&
        closingFence[0] === fence[0] &&
        closingFence.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    fence = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (fence != null) continue;

    const heading = line.match(/^ {0,3}##[ \t]+(.*)$/)?.[1];
    if (heading != null) yield heading;
  }
}

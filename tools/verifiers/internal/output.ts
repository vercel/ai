import { basename } from 'node:path';
import { readTextFile } from './file.ts';

export type FileVerifierViolations = {
  file: string;
  violationCodes: string[];
};

export function logMessage(...args: unknown[]): void {
  if (process.env.QUIET !== 'true') console.log(...args);
}

export function logError(...args: unknown[]): void {
  console.error(...args);
}

export async function outputSuccessLog(guidelineFile: string) {
  const title = await getGuidelineTitle(guidelineFile);
  logMessage(`✓ ${title}`);
}

export async function outputErrorLog(guidelineFile: string, error: unknown) {
  const title = await getGuidelineTitle(guidelineFile);
  logError(`✖ ${title}:`);
  logError('  ERROR:', error);
}

export async function outputViolationsLog(
  guidelineFile: string,
  violations: FileVerifierViolations[],
) {
  const title = await getGuidelineTitle(guidelineFile);
  const violationCodesByFile = new Map<string, Set<string>>();

  for (const { file, violationCodes } of violations) {
    const identifiers = violationCodesByFile.get(file) ?? new Set<string>();
    for (const violationCode of violationCodes) {
      identifiers.add(violationCode);
    }
    violationCodesByFile.set(file, identifiers);
  }

  logError(`✖ ${title} (see \`${guidelineFile}\`):`);
  for (const [file, violationCodes] of violationCodesByFile) {
    logError(
      `  - ${file}: violates ${[...violationCodes].map(violationCode => `\`${violationCode}\``).join(', ')}`,
    );
  }
  process.exitCode = 1;
}

async function getGuidelineTitle(guidelineFile: string) {
  const source = await readTextFile(guidelineFile);
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

    const title = line.match(/^ {0,3}#[ \t]+(.+?)\s*$/)?.[1];
    if (title != null) {
      return title.replace(/[ \t]+#+$/, '').trim();
    }
  }

  throw new Error(
    `No H1 heading found in guideline file "${basename(guidelineFile)}".`,
  );
}

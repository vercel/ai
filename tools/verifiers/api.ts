import { globSync, statSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { readTextFile } from './internal/file.ts';
import { getInputFiles } from './internal/input.ts';
import {
  outputErrorLog,
  outputSuccessLog,
  outputViolationsLog,
  type FileVerifierViolations,
} from './internal/output.ts';
import { getGuidelineFile } from './utils.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

type GuidelineFrontmatter = {
  fileMatcher: string[];
};

export type FileVerifierViolation = {
  file: string;
  violationCode: string;
};

export async function runVerifier(
  callback: (options: {
    files: string[];
    reportViolation: (violation: FileVerifierViolation) => void;
  }) => Promise<void>,
): Promise<void> {
  const guidelineFile = getGuidelineFile();
  try {
    const guidelineContents = await readTextFile(guidelineFile);
    const violationCodes = parseViolationCodes(guidelineContents);
    const { fileMatcher } = parseFrontmatter(guidelineContents);

    const inputFiles = getInputFiles();
    for (const file of inputFiles) {
      if (!matchesFileMatcher({ file, fileMatcher })) {
        throw new Error(
          `Input file "${file}" does not match fileMatcher in guideline file "${guidelineFile}".`,
        );
      }
    }
    const files =
      inputFiles.length > 0 ? inputFiles : captureFilePaths(fileMatcher);

    const violationCodesByFile = new Map<string, Set<string>>();

    function reportViolation({ file, violationCode }: FileVerifierViolation) {
      if (!violationCodes.has(violationCode)) {
        throw new Error(
          `Invalid violation code "${violationCode}" in guideline file "${guidelineFile}".`,
        );
      }

      let fileViolationCodes = violationCodesByFile.get(file);
      if (fileViolationCodes == null) {
        fileViolationCodes = new Set<string>();
        violationCodesByFile.set(file, fileViolationCodes);
      }
      fileViolationCodes.add(violationCode);
    }

    await callback({ files, reportViolation });

    if (violationCodesByFile.size === 0) {
      await outputSuccessLog(guidelineFile);
      process.exitCode = 0;
    } else {
      const violations: FileVerifierViolations[] = [
        ...violationCodesByFile,
      ].map(([file, violationCodes]) => ({
        file,
        violationCodes: [...violationCodes],
      }));
      await outputViolationsLog(guidelineFile, violations);
      process.exitCode = 2;
    }
  } catch (error) {
    await outputErrorLog(guidelineFile, error);
    process.exitCode = 1;
  }
}

function parseFrontmatter(source: string): GuidelineFrontmatter {
  const frontmatter = source.match(
    /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )?.[1];
  if (frontmatter == null) {
    throw new Error('Guideline file must contain YAML frontmatter.');
  }

  const parsed: unknown = parseYaml(frontmatter);
  if (
    parsed == null ||
    typeof parsed !== 'object' ||
    !('fileMatcher' in parsed) ||
    !Array.isArray(parsed.fileMatcher) ||
    !parsed.fileMatcher.every(pattern => typeof pattern === 'string')
  ) {
    throw new Error(
      'Guideline frontmatter must contain fileMatcher: string[].',
    );
  }

  return { fileMatcher: parsed.fileMatcher };
}

function matchesFileMatcher({
  file,
  fileMatcher,
}: {
  file: string;
  fileMatcher: string[];
}): boolean {
  return (
    fileMatcher.some(
      pattern => !pattern.startsWith('!') && matchesGlob(file, pattern),
    ) &&
    !fileMatcher.some(
      pattern => pattern.startsWith('!') && matchesGlob(file, pattern.slice(1)),
    )
  );
}

function captureFilePaths(fileMatcher: string[]): string[] {
  const patterns = fileMatcher.filter(pattern => !pattern.startsWith('!'));
  return [...new Set(globSync(patterns, { cwd: repoRoot }))]
    .filter(
      file =>
        matchesFileMatcher({ file, fileMatcher }) &&
        statSync(resolve(repoRoot, file)).isFile(),
    )
    .sort();
}

function parseViolationCodes(source: string) {
  const codes = new Set<string>();
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

    const code = line.match(/^ {0,3}##[ \t]+([^:\s]+)/)?.[1];
    if (code != null) codes.add(code);
  }

  return codes;
}

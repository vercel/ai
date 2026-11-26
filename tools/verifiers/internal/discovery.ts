import { execFileSync } from 'node:child_process';
import { globSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readTextFile } from './file.ts';
import { matchesFileMatcher, parseFrontmatter } from './guideline.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function getInputFiles({
  defaultPaths = [],
}: {
  defaultPaths?: string[];
} = {}): string[] {
  const { values, tokens } = parseArgs({
    options: {
      paths: { type: 'string', multiple: true },
      staged: { type: 'boolean' },
      modified: { type: 'boolean' },
    },
    allowPositionals: true,
    tokens: true,
  });
  const selectionFlags = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (token.name !== 'paths' && selectionFlags.has(token.name)) {
      throw new Error(`--${token.name} may only be provided once.`);
    }
    selectionFlags.add(token.name);
  }
  if (selectionFlags.size > 1) {
    throw new Error('Use only one of --paths, --staged, or --modified.');
  }

  const paths: string[] = [];
  let acceptingPaths = false;
  for (const token of tokens) {
    if (token.kind === 'option') {
      acceptingPaths = token.name === 'paths';
      if (acceptingPaths && token.value != null) paths.push(token.value);
    } else if (token.kind === 'positional' && acceptingPaths) {
      paths.push(token.value);
    } else {
      throw new Error('Unexpected positional argument. Use --paths <path> ...');
    }
  }

  if (paths.length === 0 && !values.staged && !values.modified) {
    if (defaultPaths.length === 0) {
      throw new Error('Pass --paths <path> ... or --staged or --modified.');
    }
    paths.push(...defaultPaths);
  }

  let files: string[] = [];
  if (paths.length > 0) {
    for (const path of paths) {
      const resolvedPath = relative(repoRoot, resolve(repoRoot, path));
      if (
        path.length === 0 ||
        isAbsolute(path) ||
        resolvedPath === '..' ||
        resolvedPath.startsWith(`..${sep}`)
      ) {
        throw new Error(`Path "${path}" must be relative to the repo root.`);
      }
    }
    const patterns = paths.flatMap(path => [
      path,
      `${path.replace(/\/+$/, '')}/**`,
    ]);
    files = [...new Set(globSync(patterns, { cwd: repoRoot }))].filter(file =>
      statSync(resolve(repoRoot, file), { throwIfNoEntry: false })?.isFile(),
    );
  } else if (values.modified) {
    const commands = [
      ['diff', '--staged', '--name-only', '-z'],
      ['diff', '--name-only', '-z'],
      ['ls-files', '--others', '--exclude-standard', '-z'],
    ];
    files = [
      ...new Set(
        commands.flatMap(args =>
          execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
            .split('\0')
            .filter(file => file.length > 0),
        ),
      ),
    ];
  } else if (values.staged) {
    files = execFileSync('git', ['diff', '--staged', '--name-only', '-z'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(file => file.length > 0);
  }

  return files;
}

export async function getApplicableGuidelines(
  files: string[],
): Promise<{ guidelineFile: string; files: string[] }[]> {
  const applicableGuidelines: { guidelineFile: string; files: string[] }[] = [];
  for (const guidelineFile of globSync('.agents/guidelines/*.md', {
    cwd: repoRoot,
  }).sort()) {
    if (guidelineFile === '.agents/guidelines/_TEMPLATE.md') continue;

    const { fileMatcher } = parseFrontmatter(await readTextFile(guidelineFile));
    const matchedFiles = files.filter(file =>
      matchesFileMatcher({ file, fileMatcher }),
    );
    if (matchedFiles.length > 0) {
      applicableGuidelines.push({ guidelineFile, files: matchedFiles });
    }
  }

  return applicableGuidelines;
}

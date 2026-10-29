import { parse as parseYaml } from 'yaml';
import { matchesGlob } from 'node:path';

type GuidelineFrontmatter = {
  fileMatcher: string[];
};

export function parseFrontmatter(source: string): GuidelineFrontmatter {
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

export function matchesFileMatcher({
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

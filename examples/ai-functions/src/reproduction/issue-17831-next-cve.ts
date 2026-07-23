import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  version?: string;
};

const parseVersion = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);

  if (match == null) {
    throw new Error(`Unexpected Next.js version: ${version}`);
  }

  return match.slice(1).map(Number) as [number, number, number];
};

const isBefore = (
  version: [number, number, number],
  fixed: [number, number, number],
) =>
  version[0] < fixed[0] ||
  (version[0] === fixed[0] &&
    (version[1] < fixed[1] ||
      (version[1] === fixed[1] && version[2] < fixed[2])));

const isAffected = (version: string) => {
  const parsed = parseVersion(version);

  return (
    (parsed[0] >= 13 && parsed[0] < 15) ||
    (parsed[0] === 15 && isBefore(parsed, [15, 5, 21])) ||
    (parsed[0] === 16 &&
      !isBefore(parsed, [16, 0, 0]) &&
      isBefore(parsed, [16, 2, 11]))
  );
};

async function readJson(filePath: string): Promise<PackageJson> {
  return JSON.parse(await readFile(filePath, 'utf8')) as PackageJson;
}

async function main() {
  const repositoryRoot = path.resolve(process.cwd(), '../..');
  const rootPackage = await readJson(path.join(repositoryRoot, 'package.json'));
  const examplePackage = await readJson(
    path.join(repositoryRoot, 'examples/next/package.json'),
  );
  const installedExampleNext = await readJson(
    path.join(repositoryRoot, 'examples/next/node_modules/next/package.json'),
  );
  const serverAction = await readFile(
    path.join(repositoryRoot, 'examples/next/app/actions.ts'),
    'utf8',
  );

  const rootNext = rootPackage.devDependencies?.next;
  const exampleNext = examplePackage.dependencies?.next;
  const installedVersion = installedExampleNext.version;

  if (rootNext == null || exampleNext == null || installedVersion == null) {
    throw new Error('Expected direct Next.js dependencies were not found.');
  }

  console.log({
    reportedVersionPresent: rootNext === '15.5.18',
    rootNext,
    exampleNext,
    installedExampleNext: installedVersion,
    hasAppRouterServerAction: serverAction.includes("'use server'"),
  });

  if (isAffected(installedVersion) && serverAction.includes("'use server'")) {
    throw new Error(
      `CVE-2026-64641 reproduced: examples/next uses vulnerable next@${installedVersion} with an App Router Server Action; expected next@15.5.21 or later.`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

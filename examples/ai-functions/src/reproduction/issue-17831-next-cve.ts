import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const affectedMinimum = [13, 0, 0] as const;
const patchedVersion = [15, 5, 21] as const;

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (match == null) {
    throw new Error(`Unexpected Next.js version: ${version}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < 3; index++) {
    const difference = left[index] - right[index];

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const rootPackageJsonPath = resolve(repositoryRoot, 'package.json');
  const lockfilePath = resolve(repositoryRoot, 'pnpm-lock.yaml');
  const serverActionPath = resolve(
    repositoryRoot,
    'examples/next/app/actions.ts',
  );

  const [rootPackageJsonText, lockfile, serverAction] = await Promise.all([
    readFile(rootPackageJsonPath, 'utf8'),
    readFile(lockfilePath, 'utf8'),
    readFile(serverActionPath, 'utf8'),
  ]);
  const rootPackageJson = JSON.parse(rootPackageJsonText) as PackageJson;
  const declaredVersion = rootPackageJson.devDependencies?.next;

  if (declaredVersion == null) {
    throw new Error(
      'Root package.json does not declare Next.js as a devDependency',
    );
  }

  const parsedVersion = parseVersion(declaredVersion);
  const isAffected =
    compareVersions(parsedVersion, affectedMinimum) >= 0 &&
    compareVersions(parsedVersion, patchedVersion) < 0;
  const lockfilePinsVersion =
    lockfile.includes('specifier: 15.5.18') &&
    lockfile.includes('next@15.5.18:');
  const repositoryHasServerAction = /^['"]use server['"];$/mu.test(
    serverAction,
  );

  if (isAffected && lockfilePinsVersion && repositoryHasServerAction) {
    console.error(
      `CVE-2026-64641 reproduced: root package.json declares vulnerable next@${declaredVersion} (affected >=13.0.0 <15.5.21; patched in 15.5.21).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `CVE-2026-64641 not reproduced: next@${declaredVersion} is patched or the reported repository conditions are absent.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const patchedVersion = [7, 5, 19] as const;

function isOlderThanPatched(version: string): boolean {
  const parts = version.split('.').map(part => Number.parseInt(part, 10));

  for (let index = 0; index < patchedVersion.length; index++) {
    const part = parts[index] ?? 0;
    const patchedPart = patchedVersion[index];

    if (part !== patchedPart) {
      return part < patchedPart;
    }
  }

  return false;
}

async function main() {
  const lockfilePath = resolve(process.cwd(), '../../pnpm-lock.yaml');
  const lockfile = await readFile(lockfilePath, 'utf8');
  const versions = [
    ...new Set(
      [...lockfile.matchAll(/^ {2}tar@([^:]+):$/gm)].map(match => match[1]),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );

  if (versions.length === 0) {
    throw new Error(
      'Expected pnpm-lock.yaml to resolve at least one tar version.',
    );
  }

  const vulnerableVersions = versions.filter(isOlderThanPatched);

  if (vulnerableVersions.length > 0) {
    throw new Error(
      `CVE-2026-59873: pnpm-lock.yaml resolves vulnerable tar versions: ${vulnerableVersions.join(
        ', ',
      )}; expected tar@7.5.19 or later.`,
    );
  }

  console.log(
    `pnpm-lock.yaml resolves only patched tar versions: ${versions.join(', ')}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

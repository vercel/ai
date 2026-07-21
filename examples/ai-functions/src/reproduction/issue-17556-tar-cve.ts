import { readFile } from 'node:fs/promises';

const patchedVersion = [7, 5, 19] as const;

function isVulnerable(version: string): boolean {
  const parts = version.split('.').map(Number);

  for (let index = 0; index < patchedVersion.length; index++) {
    const difference = parts[index] - patchedVersion[index];

    if (difference !== 0) {
      return difference < 0;
    }
  }

  return false;
}

async function main() {
  const lockfile = await readFile(
    new URL('../../../../pnpm-lock.yaml', import.meta.url),
    'utf8',
  );
  const versions = [
    ...new Set(
      Array.from(
        lockfile.matchAll(/^ {2}tar@(\d+\.\d+\.\d+):$/gm),
        match => match[1],
      ),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  const vulnerableVersions = versions.filter(isVulnerable);

  if (vulnerableVersions.length > 0) {
    throw new Error(
      `CVE-2026-59873 reproduced: pnpm-lock.yaml resolves vulnerable tar versions ${vulnerableVersions.join(
        ', ',
      )}; expected tar@7.5.19 or later.`,
    );
  }

  console.log(
    `CVE-2026-59873 not reproduced: all locked tar versions are patched (${versions.join(
      ', ',
    )}).`,
  );
}

main();

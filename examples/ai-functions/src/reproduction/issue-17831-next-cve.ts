import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  version?: string;
};

const readPackageJson = async (filePath: string): Promise<PackageJson> =>
  JSON.parse(await readFile(filePath, 'utf8')) as PackageJson;

const parseVersion = (version: string): [number, number, number] => {
  const [major, minor, patch] = version.split('.').map(Number);

  if (
    major === undefined ||
    minor === undefined ||
    patch === undefined ||
    [major, minor, patch].some(Number.isNaN)
  ) {
    throw new Error(`Unable to parse Next.js version: ${version}`);
  }

  return [major, minor, patch];
};

const isAffected = (version: string): boolean => {
  const [major, minor, patch] = parseVersion(version);

  if (major >= 13 && major < 15) {
    return true;
  }

  if (major === 15) {
    return minor < 5 || (minor === 5 && patch < 21);
  }

  return major === 16 && (minor < 2 || (minor === 2 && patch < 11));
};

async function main() {
  const repositoryRoot = path.resolve(process.cwd(), '../..');
  const rootPackageJson = await readPackageJson(
    path.join(repositoryRoot, 'package.json'),
  );
  const exampleDirectory = path.join(repositoryRoot, 'examples/next');
  const examplePackageJson = await readPackageJson(
    path.join(exampleDirectory, 'package.json'),
  );
  const installedNext = await readPackageJson(
    path.join(exampleDirectory, 'node_modules/next/package.json'),
  );
  const serverAction = await readFile(
    path.join(exampleDirectory, 'app/actions.ts'),
    'utf8',
  );

  const rootNext = rootPackageJson.devDependencies?.next;
  const exampleNext = examplePackageJson.dependencies?.next;
  const installedVersion = installedNext.version;

  if (!(rootNext && exampleNext && installedVersion)) {
    throw new Error('The reported Next.js dependencies are not installed.');
  }

  const hasServerAction = /^\s*['"]use server['"];?/m.test(serverAction);

  console.log(`Root devDependency: next@${rootNext}`);
  console.log(
    `Next.js example dependency: next@${exampleNext}, resolved to ${installedVersion}`,
  );
  console.log(`App Router Server Action: ${hasServerAction ? 'yes' : 'no'}`);

  if (hasServerAction && isAffected(installedVersion)) {
    throw new Error(
      `CVE-2026-64641 reproduced: examples/next resolves next@${installedVersion} and uses the App Router with a Server Action; expected a patched Next.js version (15.5.21+ on the 15.x line).`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

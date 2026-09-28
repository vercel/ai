import { execFileSync } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = join(directory, '../..');
const { packageManager } = JSON.parse(
  await readFile(join(repository, 'package.json'), 'utf8'),
);
const versions = ['3.25.76', '4.1.8'];
const selectedVersions = process.argv.length > 2 ? process.argv.slice(2) : versions;
for (const version of selectedVersions) {
  if (!versions.includes(version)) {
    throw new Error(`Unsupported test version: ${version}`);
  }
}

function run(command, args, cwd, options = {}) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    timeout: 5 * 60_000,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    ...options,
  });
}

// Follow workspace dependencies so a newly added SDK dependency cannot silently
// resolve to a published version instead of this checkout.
const packages = new Map();
const entries = await readdir(join(repository, 'packages'), {
  withFileTypes: true,
});
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const cwd = join(repository, 'packages', entry.name);
  const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
  packages.set(manifest.name, { cwd, manifest, entry: entry.name });
}
const selected = new Map();
function select(name) {
  if (selected.has(name)) return;
  const pkg = packages.get(name);
  if (!pkg) throw new Error(`Missing workspace package: ${name}`);
  selected.set(name, pkg);
  for (const [dependency, version] of Object.entries({
    ...pkg.manifest.dependencies,
    ...pkg.manifest.optionalDependencies,
    ...pkg.manifest.peerDependencies,
  })) {
    if (version.startsWith('workspace:')) select(dependency);
  }
}
select('ai');
select('@ai-sdk/openai');

const temporary = await mkdtemp(join(tmpdir(), 'ai-bundler-tests-'));
let succeeded = false;
try {
  const tarballs = join(temporary, 'tarballs');
  await mkdir(tarballs);
  const overrides = {};
  for (const [name, { cwd, entry }] of selected) {
    await access(join(cwd, 'dist/index.js'));
    const tarball = join(tarballs, `${entry}.tgz`);
    console.log(`Packing ${name}`);
    run('pnpm', ['pack', '--out', tarball], cwd, {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    overrides[name] = `file:${tarball}`;
  }

  for (const version of selectedVersions) {
    const consumer = join(temporary, `zod-${version}`);
    await cp(join(directory, 'fixture'), consumer, { recursive: true });
    const manifest = JSON.parse(
      await readFile(join(consumer, 'package.json'), 'utf8'),
    );
    manifest.packageManager = packageManager;
    manifest.dependencies = { ...manifest.dependencies, ...overrides, zod: version };
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify(manifest, null, 2),
    );
    // This is an independent workspace, outside the repository and its node_modules.
    await writeFile(
      join(consumer, 'pnpm-workspace.yaml'),
      JSON.stringify({
        packages: ['.'],
        overrides: { ...overrides, zod: version },
      }, null, 2),
    );
    console.log(`\nTesting Next.js production webpack bundles with zod@${version}`);
    run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], consumer);
    await cp(
      join(directory, 'verify-install.mjs'),
      join(consumer, 'verify-install.mjs'),
    );
    run(process.execPath, ['verify-install.mjs', ...selected.keys()], consumer);
    run(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'build', '--webpack'],
      consumer,
    );

    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(error => (error ? reject(error) : resolve(port)));
      });
    });
    run(
      process.execPath,
      [
        'node_modules/playwright/cli.js',
        'test',
        '--config',
        join(directory, 'playwright.config.ts'),
      ],
      repository,
      {
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
          BUNDLER_TEST_CONSUMER: consumer,
          BUNDLER_TEST_PORT: String(port),
          BUNDLER_TEST_ZOD: version,
        },
      },
    );
  }
  succeeded = true;
} finally {
  if (succeeded) await rm(temporary, { recursive: true, force: true });
  else console.error(`Consumer fixtures retained for investigation: ${temporary}`);
}

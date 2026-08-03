import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), 'run-package-verification-'));
const commandEnvironment = {
  ...process.env,
  npm_config_cache: join(directory, 'npm-cache'),
};

try {
  const { stdout } = await execFileAsync(
    'npm',
    [
      'pack',
      packageRoot,
      '--json',
      '--silent',
      '--ignore-scripts',
      '--pack-destination',
      directory,
    ],
    { env: commandEnvironment, maxBuffer: 10 * 1024 * 1024 },
  );
  const packed = JSON.parse(stdout)[0];
  if (packed.size > 650_000 || packed.unpackedSize > 2_100_000) {
    throw new Error(
      `Package size budget exceeded: ${packed.size} packed, ${packed.unpackedSize} unpacked.`,
    );
  }
  const paths = packed.files.map(file => file.path);
  const expectedPaths = JSON.parse(
    await readFile(join(packageRoot, 'scripts/package-files.json'), 'utf8'),
  );
  if (JSON.stringify([...paths].sort()) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `Tarball file manifest differs from the reviewed allowlist:\n${JSON.stringify([...paths].sort(), null, 2)}`,
    );
  }
  for (const required of [
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/runtime/worker-source.js',
    'package.json',
  ]) {
    if (!paths.includes(required)) throw new Error(`Tarball misses ${required}.`);
  }
  for (const path of paths) {
    if (
      path.includes('.test.') ||
      path.includes('.plans/') ||
      path.startsWith('scripts/') ||
      path.includes('node_modules') ||
      path.endsWith('.tsbuildinfo')
    ) {
      throw new Error(`Unexpected tarball entry: ${path}.`);
    }
  }

  const tarball = join(directory, packed.filename);
  const npmProject = join(directory, 'npm-project');
  await mkdir(npmProject, { recursive: true });
  await execFileAsync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--prefix',
      npmProject,
      tarball,
    ],
    { env: commandEnvironment, maxBuffer: 10 * 1024 * 1024 },
  );
  const verificationSource = `
    import { getBindingContext, run } from 'run';
    const completed = await run({ source: 'return 42;' });
    if (completed.status !== 'completed' || completed.value !== 42) throw new Error('completion failed');
    const binding = await run({
      source: 'return await tools.echo({ ok: true });',
      bindings: { tools: { echo: input => input } },
    });
    if (binding.status !== 'completed' || binding.value.ok !== true) throw new Error('binding failed');
    const source = 'return await tools.pause();';
    const bindings = { tools: { pause: () => {
      const context = getBindingContext();
      if (!context.resume) context.interrupt({ kind: 'pause' });
      return context.resume.resolution;
    } } };
    const interrupted = await run({ source, bindings });
    if (interrupted.status !== 'interrupted') throw new Error('interruption failed');
    const resumed = await run({
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [{ interruptionId: interrupted.interruptions[0].id, value: 'ok' }],
    });
    if (resumed.status !== 'completed' || resumed.value !== 'ok') throw new Error('resume failed');
  `;
  const npmEntry = join(npmProject, 'verify.mjs');
  await writeFile(npmEntry, verificationSource);
  await execFileAsync(process.execPath, [npmEntry], {
    cwd: npmProject,
    env: {
      ...commandEnvironment,
      NODE_NO_WARNINGS: '1',
      RUN_CONTINUATION_SECRET: 'run-package-verification-secret-key',
    },
  });

  const bundlePath = join(npmProject, 'verify-bundled.mjs');
  await build({
    entryPoints: [npmEntry],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: false,
  });
  await execFileAsync(process.execPath, [bundlePath], {
    cwd: npmProject,
    env: {
      ...commandEnvironment,
      NODE_NO_WARNINGS: '1',
      RUN_CONTINUATION_SECRET: 'run-package-verification-secret-key',
    },
  });

  const pnpmProject = join(directory, 'pnpm-project');
  await mkdir(pnpmProject, { recursive: true });
  await writeFile(
    join(pnpmProject, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  await execFileAsync('pnpm', ['add', '--offline', tarball], {
    cwd: pnpmProject,
    env: commandEnvironment,
    maxBuffer: 10 * 1024 * 1024,
  });
  const pnpmEntry = join(pnpmProject, 'verify.mjs');
  await writeFile(pnpmEntry, verificationSource);
  await execFileAsync(process.execPath, [pnpmEntry], {
    cwd: pnpmProject,
    env: {
      ...commandEnvironment,
      NODE_NO_WARNINGS: '1',
      RUN_CONTINUATION_SECRET: 'run-package-verification-secret-key',
    },
  });

  for (const project of [npmProject, pnpmProject]) {
    const manifest = JSON.parse(
      await readFile(join(project, 'node_modules/run/package.json'), 'utf8'),
    );
    const publishedDependencyGraph = JSON.stringify({
      dependencies: manifest.dependencies,
      optionalDependencies: manifest.optionalDependencies,
      peerDependencies: manifest.peerDependencies,
    });
    if (
      manifest.name !== 'run' ||
      publishedDependencyGraph.includes('workspace:')
    ) {
      throw new Error('Installed manifest is invalid.');
    }
    await assertPortableSourceMaps(join(project, 'node_modules/run'));
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        name: packed.name,
        version: packed.version,
        packageBytes: packed.size,
        unpackedBytes: packed.unpackedSize,
        entries: packed.entryCount,
        npm: 'passed',
        pnpm: 'passed',
        bundled: 'passed',
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function assertPortableSourceMaps(root) {
  for (const path of await walk(root)) {
    if (!path.endsWith('.map')) continue;
    const map = JSON.parse(await readFile(path, 'utf8'));
    for (const source of map.sources ?? []) {
      if (source.startsWith('/') || source.startsWith('file:')) {
        throw new Error(`Absolute source path in ${path}: ${source}.`);
      }
    }
  }
}

async function walk(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else result.push(path);
  }
  return result;
}

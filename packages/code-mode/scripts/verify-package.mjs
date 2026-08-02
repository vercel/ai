import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(packageRoot, '../..');
const runRoot = resolve(packageRoot, '../run');
const aiVersion = JSON.parse(
  await import('node:fs/promises').then(({ readFile }) =>
    readFile(resolve(packageRoot, '../ai/package.json'), 'utf8'),
  ),
).version;
const directory = await mkdtemp(join(tmpdir(), 'code-mode-package-'));
const environment = {
  ...process.env,
  npm_config_cache: join(directory, 'npm-cache'),
};

try {
  const runTarball = await pack(runRoot);
  const codeModeTarball = await pack(packageRoot);
  const source = `
    import { tool } from 'ai';
    import { z } from 'zod/v4';
    import { run } from 'run';
    import {
      experimental_isCodeModeInterrupted as isCodeModeInterrupted,
      experimental_runCodeMode as runCodeMode,
    } from '@ai-sdk/code-mode';

    const direct = await run({ source: 'return 21 * 2;' });
    if (direct.status !== 'completed' || direct.value !== 42) throw new Error('run failed');
    const guarded = tool({
      inputSchema: z.object({ value: z.number() }),
      needsApproval: true,
      execute: async ({ value }) => value * 2,
    });
    const js = 'return await tools.guarded({ value: 21 });';
    const first = await runCodeMode({ js, tools: { guarded }, continuationContext: { tenant: 'fixture' } });
    if (!isCodeModeInterrupted(first)) throw new Error('approval did not interrupt');
    const completed = await runCodeMode({
      js,
      tools: { guarded },
      continuationContext: { tenant: 'fixture' },
      continuation: first.continuation,
      resolutions: first.interruptions.map(({ id }) => ({ interruptionId: id, value: true })),
    });
    if (completed !== 42) throw new Error('code-mode resume failed');
  `;

  for (const packageManager of ['npm', 'pnpm']) {
    const fixture = join(directory, packageManager);
    await mkdir(fixture, { recursive: true });
    await writeFile(
      join(fixture, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: {
          '@ai-sdk/code-mode': `file:${codeModeTarball}`,
          ai: aiVersion,
          run: `file:${runTarball}`,
          zod: '4.1.8',
        },
      }),
    );
    if (packageManager === 'npm') {
      await execFileAsync(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--no-package-lock',
        ],
        { cwd: fixture, env: environment, maxBuffer: 20 * 1024 * 1024 },
      );
    } else {
      await writeFile(
        join(fixture, 'pnpm-workspace.yaml'),
        `minimumReleaseAge: 4320\nminimumReleaseAgeExclude:\n  - '@ai-sdk/*'\n  - ai\n  - run\noverrides:\n  run: file:${runTarball}\n`,
      );
      await execFileAsync('pnpm', ['install'], {
        cwd: fixture,
        env: environment,
        maxBuffer: 20 * 1024 * 1024,
      });
    }
    await writeFile(join(fixture, 'verify.ts'), source);
    await writeFile(
      join(fixture, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          target: 'ES2022',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['verify.ts'],
      }),
    );
    await execFileAsync(
      process.execPath,
      [resolve(workspaceRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
      { cwd: fixture, env: environment },
    );
    const entry = join(fixture, 'verify.mjs');
    await writeFile(entry, source);
    await execFileAsync(process.execPath, [entry], {
      cwd: fixture,
      env: {
        ...environment,
        NODE_NO_WARNINGS: '1',
        RUN_CONTINUATION_SECRET: 'code-mode-package-verification-secret',
      },
    });
  }

  process.stdout.write('Packed run + code-mode npm/pnpm consumers passed.\n');
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function pack(root) {
  const { stdout } = await execFileAsync(
    'pnpm',
    ['pack', '--pack-destination', directory],
    { cwd: root, env: environment, maxBuffer: 20 * 1024 * 1024 },
  );
  const filename = stdout.trim().split('\n').at(-1);
  if (!filename) throw new Error(`pnpm pack produced no tarball for ${root}.`);
  return resolve(root, filename);
}

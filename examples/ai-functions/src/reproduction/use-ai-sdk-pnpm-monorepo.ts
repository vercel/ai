import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function run({
  command,
  args,
  cwd,
  env,
}: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}) {
  return new Promise<{ exitCode: number; output: string }>(
    (resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';

      child.stdout.on('data', chunk => {
        output += chunk;
      });
      child.stderr.on('data', chunk => {
        output += chunk;
      });
      child.on('error', reject);
      child.on('close', exitCode => {
        resolve({ exitCode: exitCode ?? -1, output });
      });
    },
  );
}

async function main() {
  const workspaceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const skill = await readFile(
    path.join(workspaceRoot, 'skills/use-ai-sdk/SKILL.md'),
    'utf8',
  );

  assert.match(
    skill,
    /If `node_modules\/ai\/` does not exist, install \*\*only\*\* the `ai` package/,
  );
  assert.match(skill, /pnpm add ai/);

  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'ai-sdk-issue-21255-'));
  const appRoot = path.join(fixtureRoot, 'apps/web');
  const aiPackageRoot = path.join(fixtureRoot, 'packages/ai');
  const corepackHome = path.join(fixtureRoot, '.corepack');

  try {
    await mkdir(appRoot, { recursive: true });
    await mkdir(aiPackageRoot, { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify({ name: 'fixture-root', private: true }, null, 2),
    );
    await writeFile(
      path.join(fixtureRoot, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    );
    await writeFile(
      path.join(appRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'web',
          private: true,
          dependencies: { ai: 'workspace:*' },
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(aiPackageRoot, 'package.json'),
      JSON.stringify({ name: 'ai', version: '7.0.107' }, null, 2),
    );

    const pnpmArgs = ['pnpm@10.33.0'];
    const install = await run({
      command: 'corepack',
      args: [...pnpmArgs, 'install', '--ignore-scripts'],
      cwd: fixtureRoot,
      env: { COREPACK_HOME: corepackHome },
    });
    assert.equal(install.exitCode, 0, install.output);

    const rootAiPath = path.join(fixtureRoot, 'node_modules/ai/package.json');
    const appAiPath = path.join(appRoot, 'node_modules/ai/package.json');
    await assert.rejects(readFile(rootAiPath, 'utf8'), { code: 'ENOENT' });
    assert.equal(
      JSON.parse(await readFile(appAiPath, 'utf8')).version,
      '7.0.107',
    );

    const resolved = await run({
      command: process.execPath,
      args: ['-p', "require.resolve('ai/package.json')"],
      cwd: appRoot,
    });
    assert.equal(resolved.exitCode, 0, resolved.output);
    assert.match(resolved.output, /packages\/ai\/package\.json/);

    const rootManifestBefore = await readFile(
      path.join(fixtureRoot, 'package.json'),
      'utf8',
    );
    const fallback = await run({
      command: 'corepack',
      args: [...pnpmArgs, 'add', 'ai', '--ignore-scripts'],
      cwd: fixtureRoot,
      env: { COREPACK_HOME: corepackHome },
    });
    const rootManifestAfter = await readFile(
      path.join(fixtureRoot, 'package.json'),
      'utf8',
    );

    assert.equal(fallback.exitCode, 1, fallback.output);
    assert.match(fallback.output, /ERR_PNPM_ADDING_TO_ROOT/);
    assert.equal(rootManifestAfter, rootManifestBefore);

    console.log(
      'Confirmed the skill root-only check selects its fallback even though apps/web already has ai 7.0.107.',
    );
    console.log(
      'Could not reproduce issue #21255: pnpm 10.33.0 rejected "pnpm add ai" at the workspace root with ERR_PNPM_ADDING_TO_ROOT, and the root package.json was unchanged.',
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

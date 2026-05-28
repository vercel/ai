import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageRoot = fileURLToPath(
  new URL('../node_modules/ai-sdk-code-mode/', import.meta.url),
);
const distEntry = fileURLToPath(
  new URL('../node_modules/ai-sdk-code-mode/dist/index.js', import.meta.url),
);
const tsconfig = fileURLToPath(
  new URL('../node_modules/ai-sdk-code-mode/tsconfig.json', import.meta.url),
);
const tscBin = fileURLToPath(
  new URL('../node_modules/typescript/bin/tsc', import.meta.url),
);

if (!existsSync(tsconfig)) {
  console.error(
    'ai-sdk-code-mode is not installed yet. Run `pnpm install` from the repository root.',
  );
  process.exit(1);
}

await ensureWorkspacePackagesAreBuilt();

if (existsSync(distEntry)) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [tscBin, '-p', tsconfig], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Keep TypeScript output inside the dependency package so Node can load
    // worker files via `new URL("./worker.js", import.meta.url)`.
    INIT_CWD: root,
  },
});

if (result.status !== 0 && !existsSync(distEntry)) {
  process.exit(result.status ?? 1);
}

async function ensureWorkspacePackagesAreBuilt() {
  try {
    const [ai, providerUtils] = await Promise.all([
      import('ai'),
      import('@ai-sdk/provider-utils'),
    ]);
    if (
      typeof ai.tool === 'function' &&
      typeof providerUtils.executeTool === 'function' &&
      typeof providerUtils.safeValidateTypes === 'function'
    ) {
      return;
    }
  } catch {
    // Fall through and build the packages.
  }

  run('pnpm', ['--filter', '@ai-sdk/provider', 'build'], repoRoot);
  run('pnpm', ['--filter', '@ai-sdk/provider-utils', 'build'], repoRoot);
  run('pnpm', ['--filter', '@ai-sdk/gateway', 'build'], repoRoot);
  run('pnpm', ['--filter', 'ai', 'build'], repoRoot);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

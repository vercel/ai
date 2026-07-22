import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const run = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', exitCode => {
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });

const assertSuccess = (label: string, result: CommandResult) => {
  if (result.exitCode === 0) {
    return;
  }

  throw new Error(
    [
      `${label} failed with exit code ${result.exitCode}.`,
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join('\n'),
  );
};

const writeProject = async (directory: string) => {
  await mkdir(join(directory, 'src'), { recursive: true });

  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify(
      {
        name: 'issue-10218-reproduction',
        private: true,
        dependencies: {
          '@ai-sdk/deepseek': '1.0.28',
          '@typescript-eslint/eslint-plugin': '8.43.0',
          '@typescript-eslint/parser': '8.43.0',
          eslint: '8.57.1',
          typescript: '5.9.2',
          zod: '3.25.76',
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(directory, '.eslintrc.cjs'),
    `module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
  },
};
`,
  );

  await writeFile(
    join(directory, 'src/index.ts'),
    `import { deepseek } from '@ai-sdk/deepseek';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type DeepSeekProviderIsTyped = AssertFalse<IsAny<typeof deepseek>>;
type DeepSeekReturnIsTyped = AssertFalse<IsAny<ReturnType<typeof deepseek>>>;

export function model() {
  return deepseek('deepseek-chat');
}

void (undefined as unknown as DeepSeekProviderIsTyped);
void (undefined as unknown as DeepSeekReturnIsTyped);
`,
  );
};

const lintAndTypeCheck = async (directory: string, label: string) => {
  const eslintResult = await run(
    join(directory, 'node_modules/.bin/eslint'),
    ['src/index.ts', '--format', 'unix'],
    directory,
  );
  assertSuccess(`${label} typed ESLint`, eslintResult);

  const typeScriptResult = await run(
    join(directory, 'node_modules/.bin/tsc'),
    ['--project', 'tsconfig.json'],
    directory,
  );
  assertSuccess(`${label} TypeScript`, typeScriptResult);

  process.stdout.write(
    `PASS ${label}: deepseek and its return type are not any; typed ESLint reported no unsafe call or return.\n`,
  );
};

async function main() {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const temporaryDirectory = await mkdtemp(
    join(repositoryRoot, '.issue-10218-'),
  );

  try {
    await writeProject(temporaryDirectory);

    const installResult = await run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      temporaryDirectory,
    );
    assertSuccess('dependency installation', installResult);

    const publishedManifest = JSON.parse(
      await readFile(
        join(temporaryDirectory, 'node_modules/@ai-sdk/deepseek/package.json'),
        'utf8',
      ),
    ) as { version: string };

    await lintAndTypeCheck(
      temporaryDirectory,
      `published @ai-sdk/deepseek ${publishedManifest.version}`,
    );

    const installedDeepSeek = join(
      temporaryDirectory,
      'node_modules/@ai-sdk/deepseek',
    );
    await rm(installedDeepSeek, { recursive: true });
    await symlink(
      join(repositoryRoot, 'packages/deepseek'),
      installedDeepSeek,
      'dir',
    );

    const workspaceManifest = JSON.parse(
      await readFile(
        join(repositoryRoot, 'packages/deepseek/package.json'),
        'utf8',
      ),
    ) as { version: string };

    await lintAndTypeCheck(
      temporaryDirectory,
      `release-v5.0 workspace @ai-sdk/deepseek ${workspaceManifest.version}`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

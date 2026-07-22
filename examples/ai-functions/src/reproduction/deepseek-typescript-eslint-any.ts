import { execFile } from 'node:child_process';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function main() {
  const fixtureDirectory = path.join(
    process.cwd(),
    '.tmp',
    'issue-10218-typescript-eslint',
  );
  const sourceDirectory = path.join(fixtureDirectory, 'src');
  const sourcePath = path.join(sourceDirectory, 'index.ts');

  await rm(fixtureDirectory, { force: true, recursive: true });
  await mkdir(sourceDirectory, { recursive: true });

  try {
    await writeFile(
      path.join(fixtureDirectory, 'package.json'),
      JSON.stringify(
        {
          private: true,
          type: 'module',
          devDependencies: {
            '@typescript-eslint/eslint-plugin': '8.43.0',
            '@typescript-eslint/parser': '8.43.0',
            eslint: '9.35.0',
            typescript: '5.9.2',
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(fixtureDirectory, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
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
      sourcePath,
      `import { deepseek } from '@ai-sdk/deepseek';
import { mistral } from '@ai-sdk/mistral';
import { openai } from '@ai-sdk/openai';

export function createDeepSeekModel() {
  return deepseek('deepseek-chat');
}

export function createMistralModel() {
  return mistral('mistral-small-latest');
}

export function createOpenAIModel() {
  return openai('gpt-4o-mini');
}
`,
    );

    await writeFile(
      path.join(fixtureDirectory, 'lint.mjs'),
      `import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import tseslintParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import path from 'node:path';

const fixtureDirectory = process.cwd();
const sourcePath = path.join(fixtureDirectory, 'src/index.ts');
const eslint = new ESLint({
  cwd: fixtureDirectory,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.ts'],
      languageOptions: {
        parser: tseslintParser,
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir: fixtureDirectory,
        },
      },
      plugins: {
        '@typescript-eslint': tseslintPlugin,
      },
      rules: {
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
      },
    },
  ],
});

const [result] = await eslint.lintFiles([sourcePath]);
const unsafeMessages = result.messages.filter(message =>
  [
    '@typescript-eslint/no-unsafe-call',
    '@typescript-eslint/no-unsafe-return',
  ].includes(message.ruleId ?? ''),
);

if (unsafeMessages.length > 0) {
  for (const message of unsafeMessages) {
    console.error(
      \`\${message.line}:\${message.column} \${message.ruleId}: \${message.message}\`,
    );
  }
  console.error(
    'ISSUE #10218 REPRODUCED: DeepSeek is treated as any by typescript-eslint.',
  );
  process.exitCode = 1;
} else {
  console.log(
    'Issue #10218 did not reproduce: typescript-eslint reported no unsafe DeepSeek call or return.',
  );
}
`,
    );

    try {
      await execFileAsync(
        'npm',
        ['install', '--no-audit', '--no-fund', '--ignore-scripts'],
        {
          cwd: fixtureDirectory,
        },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error != null &&
        'stdout' in error &&
        'stderr' in error
      ) {
        console.error(String(error.stdout));
        console.error(String(error.stderr));
      }
      throw error;
    }

    const aiSdkModulesDirectory = path.join(
      fixtureDirectory,
      'node_modules',
      '@ai-sdk',
    );
    await mkdir(aiSdkModulesDirectory, { recursive: true });
    for (const provider of ['deepseek', 'mistral', 'openai']) {
      await symlink(
        path.resolve(process.cwd(), '../../packages', provider),
        path.join(aiSdkModulesDirectory, provider),
        'dir',
      );
    }

    try {
      await execFileAsync(
        path.join(fixtureDirectory, 'node_modules', '.bin', 'tsc'),
        ['--noEmit'],
        { cwd: fixtureDirectory },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error != null &&
        'stdout' in error &&
        'stderr' in error
      ) {
        console.error(String(error.stdout));
        console.error(String(error.stderr));
      }
      throw error;
    }

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['lint.mjs'],
      {
        cwd: fixtureDirectory,
      },
    ).catch(
      (
        error: Error & {
          code?: number;
          stderr?: string;
          stdout?: string;
        },
      ) => {
        process.stdout.write(error.stdout ?? '');
        process.stderr.write(error.stderr ?? '');
        process.exitCode = error.code ?? 1;
        return { stderr: '', stdout: '' };
      },
    );

    process.stdout.write(stdout);
    process.stderr.write(stderr);
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

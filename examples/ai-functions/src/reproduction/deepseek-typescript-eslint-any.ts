import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const workspaceRoot = path.resolve(process.cwd(), '../..');
const temporaryRoot = path.join(
  workspaceRoot,
  '.tmp',
  'issue-10218-reproduction',
);
const reportedProjectRoot = path.join(temporaryRoot, 'reported-versions');
const targetProjectRoot = path.join(temporaryRoot, 'release-v6');

const source = `import { deepseek } from '@ai-sdk/deepseek';
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
`;

const moduleConfigurations = [
  { module: 'Node16', moduleResolution: 'Node16' },
  { module: 'NodeNext', moduleResolution: 'NodeNext' },
  { module: 'ESNext', moduleResolution: 'Bundler' },
] as const;

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function installReportedVersions() {
  await mkdir(path.join(reportedProjectRoot, 'src'), { recursive: true });
  await writeJson(path.join(reportedProjectRoot, 'package.json'), {
    private: true,
    dependencies: {
      '@ai-sdk/deepseek': '1.0.28',
      '@ai-sdk/mistral': '2.0.23',
      '@ai-sdk/openai': '2.0.64',
      '@typescript-eslint/eslint-plugin': '8.43.0',
      '@typescript-eslint/parser': '8.43.0',
      eslint: '8.57.1',
      typescript: '5.9.2',
      zod: '3.25.76',
    },
  });
  await writeFile(path.join(reportedProjectRoot, 'src', 'index.ts'), source);

  await execFileAsync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    {
      cwd: reportedProjectRoot,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

async function linkTargetBranchProviders() {
  const scopeDirectory = path.join(
    targetProjectRoot,
    'node_modules',
    '@ai-sdk',
  );
  await mkdir(path.join(targetProjectRoot, 'src'), { recursive: true });
  await mkdir(scopeDirectory, { recursive: true });
  await writeFile(path.join(targetProjectRoot, 'src', 'index.ts'), source);

  for (const provider of ['deepseek', 'mistral', 'openai']) {
    await symlink(
      path.join(workspaceRoot, 'packages', provider),
      path.join(scopeDirectory, provider),
      'dir',
    );
  }
}

async function writeEslintConfig(projectRoot: string) {
  const requireFromReportedProject = createRequire(
    path.join(reportedProjectRoot, 'package.json'),
  );
  const parserPath = requireFromReportedProject.resolve(
    '@typescript-eslint/parser',
  );

  await writeFile(
    path.join(projectRoot, '.eslintrc.cjs'),
    `module.exports = {
  root: true,
  parser: ${JSON.stringify(parserPath)},
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
  },
};
`,
  );
}

async function readTypingEvidence(projectRoot: string) {
  const packageRoot = path.join(
    projectRoot,
    'node_modules',
    '@ai-sdk',
    'deepseek',
  );
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const declaration = await readFile(
    path.join(packageRoot, 'dist', 'index.d.ts'),
    'utf8',
  );
  const providerDeclaration = await readFile(
    path.join(packageRoot, 'dist', 'deepseek-provider.d.ts'),
    'utf8',
  ).catch(() => '');

  return {
    version: manifest.version as string,
    topLevelTypes: manifest.types as string | undefined,
    exportTypes: manifest.exports?.['.']?.types as string | undefined,
    declarationIsTyped:
      /(?:declare )?const deepseek: DeepSeekProvider/.test(declaration) ||
      (/export \{ createDeepSeek, deepseek \} from '\.\/deepseek-provider'/.test(
        declaration,
      ) &&
        /(?:declare )?const deepseek: DeepSeekProvider/.test(
          providerDeclaration,
        )),
  };
}

async function lintProject({
  label,
  projectRoot,
}: {
  label: string;
  projectRoot: string;
}) {
  const eslintBinary = path.join(
    reportedProjectRoot,
    'node_modules',
    'eslint',
    'bin',
    'eslint.js',
  );

  for (const configuration of moduleConfigurations) {
    await writeJson(path.join(projectRoot, 'tsconfig.json'), {
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: configuration.module,
        moduleResolution: configuration.moduleResolution,
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    });

    let stdout = '';
    let exitCode = 0;
    try {
      ({ stdout } = await execFileAsync(
        process.execPath,
        [
          eslintBinary,
          'src/index.ts',
          '--format',
          'json',
          '--resolve-plugins-relative-to',
          reportedProjectRoot,
        ],
        {
          cwd: projectRoot,
          maxBuffer: 10 * 1024 * 1024,
        },
      ));
    } catch (error) {
      const failure = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      exitCode = failure.code ?? 1;
      stdout = failure.stdout ?? '';
      if (!stdout) {
        throw new Error(
          `ESLint harness failed for ${label}: ${failure.stderr ?? String(error)}`,
        );
      }
    }

    const reports = JSON.parse(stdout) as Array<{
      messages: Array<{
        line: number;
        message: string;
        ruleId: string | null;
      }>;
    }>;
    const unsafeMessages = reports
      .flatMap(report => report.messages)
      .filter(message =>
        message.ruleId?.startsWith('@typescript-eslint/no-unsafe'),
      );
    const deepSeekMessages = unsafeMessages.filter(
      message => message.line <= 7,
    );

    if (deepSeekMessages.length > 0) {
      throw new Error(
        `REPRODUCED: deepseek is treated as any by typescript-eslint (${label}, moduleResolution ${configuration.moduleResolution}): ${deepSeekMessages
          .map(message => message.message)
          .join('; ')}`,
      );
    }

    if (exitCode !== 0 || unsafeMessages.length > 0) {
      throw new Error(
        `Comparison provider or lint harness failure for ${label}, moduleResolution ${configuration.moduleResolution}: ${stdout}`,
      );
    }

    console.log(
      `PASS ${label}: no unsafe call or return with moduleResolution ${configuration.moduleResolution}`,
    );
  }
}

async function main() {
  await rm(temporaryRoot, { recursive: true, force: true });

  try {
    await installReportedVersions();
    await linkTargetBranchProviders();
    await writeEslintConfig(reportedProjectRoot);
    await writeEslintConfig(targetProjectRoot);

    const reportedEvidence = await readTypingEvidence(reportedProjectRoot);
    const targetEvidence = await readTypingEvidence(targetProjectRoot);
    console.log('DeepSeek typing evidence:', {
      reported: reportedEvidence,
      target: targetEvidence,
    });

    await lintProject({
      label: '@ai-sdk/deepseek 1.0.28 with reported tooling',
      projectRoot: reportedProjectRoot,
    });
    await lintProject({
      label: `release-v6 @ai-sdk/deepseek ${targetEvidence.version}`,
      projectRoot: targetProjectRoot,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

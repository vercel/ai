import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const pnpmVersion = '10.33.0';
const aiVersion = '7.0.107';
const reactVersion = '4.0.110';

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function run(
  command: string,
  args: string[],
  {
    cwd,
    env,
  }: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  if (result.error != null) {
    throw result.error;
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: `${result.stdout}${result.stderr}`,
  };
}

async function main() {
  const exampleDirectory = process.cwd();
  const repositoryRoot = resolve(exampleDirectory, '../..');
  const skillPath = join(repositoryRoot, 'skills/use-ai-sdk/SKILL.md');
  const skill = readFileSync(skillPath, 'utf8');
  const skillUsesRootOnlyFallback =
    skill.includes(
      'check if `node_modules/ai/docs/` exists. If not, install **only** the `ai` package',
    ) && skill.includes('e.g., `pnpm add ai`');

  const workspaceRoot = mkdtempSync(
    join(exampleDirectory, '.issue-21255-workspace-'),
  );
  const applicationDirectory = join(workspaceRoot, 'apps/web');
  const corepackHome = join(workspaceRoot, '.corepack');
  const rootManifestPath = join(workspaceRoot, 'package.json');
  const applicationManifestPath = join(applicationDirectory, 'package.json');

  try {
    mkdirSync(applicationDirectory, { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n\nnodeLinker: isolated\n",
    );
    writeFileSync(
      rootManifestPath,
      JSON.stringify(
        {
          name: 'issue-21255-workspace',
          private: true,
          packageManager: `pnpm@${pnpmVersion}`,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      applicationManifestPath,
      JSON.stringify(
        {
          name: 'web',
          private: true,
          dependencies: {
            '@ai-sdk/react': reactVersion,
            ai: aiVersion,
          },
        },
        null,
        2,
      ),
    );

    const pnpmEnvironment = { COREPACK_HOME: corepackHome };
    const install = run(
      'corepack',
      [`pnpm@${pnpmVersion}`, 'install', '--ignore-scripts'],
      {
        cwd: workspaceRoot,
        env: pnpmEnvironment,
      },
    );

    if (install.status !== 0) {
      throw new Error(
        `Failed to create the reported pnpm workspace:\n${install.output}`,
      );
    }

    const rootAiDirectory = join(workspaceRoot, 'node_modules/ai');
    const applicationAiDirectory = join(
      applicationDirectory,
      'node_modules/ai',
    );
    const applicationReactDirectory = join(
      applicationDirectory,
      'node_modules/@ai-sdk/react',
    );
    const rootReactDirectory = join(
      workspaceRoot,
      'node_modules/@ai-sdk/react',
    );

    if (existsSync(rootAiDirectory)) {
      throw new Error(
        'Expected isolated linking to leave `node_modules/ai` absent at the workspace root.',
      );
    }
    if (!existsSync(join(applicationAiDirectory, 'docs'))) {
      throw new Error(
        'Expected the workspace application to contain the installed `ai` docs.',
      );
    }

    const installedAiVersion = readJson(
      join(applicationAiDirectory, 'package.json'),
    ).version;
    const installedReactVersion = readJson(
      join(applicationReactDirectory, 'package.json'),
    ).version;

    if (installedAiVersion !== aiVersion) {
      throw new Error(
        `Expected ai ${aiVersion}, received ${installedAiVersion}.`,
      );
    }
    if (installedReactVersion !== reactVersion) {
      throw new Error(
        `Expected @ai-sdk/react ${reactVersion}, received ${installedReactVersion}.`,
      );
    }

    const resolveFromApplication = run(
      process.execPath,
      ['-p', "require.resolve('ai/package.json')"],
      { cwd: applicationDirectory },
    );

    if (
      resolveFromApplication.status !== 0 ||
      resolveFromApplication.stdout.trim() !==
        realpathSync(join(applicationAiDirectory, 'package.json'))
    ) {
      throw new Error(
        `Expected ai to resolve from apps/web:\n${resolveFromApplication.output}`,
      );
    }

    const rootManifestBeforeFallback = readFileSync(rootManifestPath, 'utf8');
    const applicationManifestBeforeFallback = readFileSync(
      applicationManifestPath,
      'utf8',
    );
    const fallback = skillUsesRootOnlyFallback
      ? run('corepack', [`pnpm@${pnpmVersion}`, 'add', 'ai'], {
          cwd: workspaceRoot,
          env: pnpmEnvironment,
        })
      : undefined;
    const rootManifestAfterFallback = readFileSync(rootManifestPath, 'utf8');
    const applicationManifestAfterFallback = readFileSync(
      applicationManifestPath,
      'utf8',
    );
    const rootManifest = readJson(rootManifestPath);
    const rootHasAiDependency =
      rootManifest.dependencies?.ai != null ||
      rootManifest.devDependencies?.ai != null ||
      rootManifest.optionalDependencies?.ai != null;
    const rootManifestChanged =
      rootManifestAfterFallback !== rootManifestBeforeFallback;
    const applicationManifestChanged =
      applicationManifestAfterFallback !== applicationManifestBeforeFallback;
    const rootAiDirectoryExists = existsSync(rootAiDirectory);
    const rootReactDirectoryExists = existsSync(rootReactDirectory);
    const rootAiVersion = rootAiDirectoryExists
      ? readJson(join(rootAiDirectory, 'package.json')).version
      : undefined;
    const applicationAiVersionAfterFallback = readJson(
      join(applicationAiDirectory, 'package.json'),
    ).version;
    const applicationReactVersionAfterFallback = readJson(
      join(applicationReactDirectory, 'package.json'),
    ).version;

    console.log(
      JSON.stringify(
        {
          skillUsesRootOnlyFallback,
          rootAiDirectoryExists,
          rootAiVersion,
          rootReactDirectoryExists,
          applicationAiDocsExist: existsSync(
            join(applicationAiDirectory, 'docs'),
          ),
          applicationAiVersionBeforeFallback: installedAiVersion,
          applicationAiVersionAfterFallback,
          applicationReactVersionBeforeFallback: installedReactVersion,
          applicationReactVersionAfterFallback,
          resolvedAiPackageJson: resolveFromApplication.stdout.trim(),
          fallbackCommand: fallback == null ? undefined : 'pnpm add ai',
          fallbackExitCode: fallback?.status,
          rootManifestChanged,
          applicationManifestChanged,
        },
        null,
        2,
      ),
    );

    if (rootManifestChanged || rootHasAiDependency || rootAiDirectoryExists) {
      throw new Error(
        'Reproduced issue #21255: the documented fallback installed ai into the pnpm workspace root.',
      );
    }

    if (applicationManifestChanged) {
      throw new Error(
        'Expected the fallback to leave apps/web/package.json unchanged.',
      );
    }
  } finally {
    rmSync(workspaceRoot, { force: true, recursive: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

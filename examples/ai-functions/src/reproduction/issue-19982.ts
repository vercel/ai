import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const packageDir = join(repoRoot, 'packages/harness-claude-code');
const workDir = join(repoRoot, '.reproduction/issue-19982');
const packDir = join(workDir, 'pack');

function run(
  command: string,
  args: string[],
  cwd: string,
): { status: number; output: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  if (result.error != null) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}

function requireSuccess(
  label: string,
  result: { status: number; output: string },
): void {
  if (result.status !== 0) {
    throw new Error(`${label} failed unexpectedly:\n${result.output}`);
  }
}

async function main(): Promise<void> {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });

  try {
    requireSuccess('harness package build', run('pnpm', ['build'], packageDir));
    requireSuccess(
      'harness package pack',
      run('pnpm', ['pack', '--pack-destination', packDir], packageDir),
    );

    const tarball = readdirSync(packDir).find(name => name.endsWith('.tgz'));
    if (tarball == null) {
      throw new Error('harness package tarball was not created');
    }

    mkdirSync(join(workDir, 'app/api/probe'), { recursive: true });
    writeFileSync(
      join(workDir, 'package.json'),
      JSON.stringify({
        name: 'issue-19982-reproduction',
        private: true,
        type: 'module',
      }),
    );
    writeFileSync(
      join(workDir, 'app/api/probe/route.js'),
      [
        "import { createClaudeCode } from '@ai-sdk/harness-claude-code';",
        "export const dynamic = 'force-dynamic';",
        'export async function GET() {',
        '  return Response.json({ ok: typeof createClaudeCode });',
        '}',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(workDir, 'app/layout.js'),
      [
        'export default function RootLayout({ children }) {',
        '  return <html lang="en"><body>{children}</body></html>;',
        '}',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(workDir, 'app/page.js'),
      [
        'export default function Page() {',
        '  return <main>repro</main>;',
        '}',
        '',
      ].join('\n'),
    );

    requireSuccess(
      'dependency installation',
      run(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--save-exact',
          'next@16.3.3',
          'react@19.2.8',
          'react-dom@19.2.8',
          join(packDir, tarball),
        ],
        workDir,
      ),
    );

    writeFileSync(
      join(workDir, 'next.config.mjs'),
      "export default { serverExternalPackages: ['@ai-sdk/harness-claude-code'] };\n",
    );
    requireSuccess(
      'Turbopack build with serverExternalPackages',
      run('npx', ['--no-install', 'next', 'build'], workDir),
    );

    rmSync(join(workDir, 'next.config.mjs'));
    rmSync(join(workDir, '.next'), { recursive: true, force: true });
    requireSuccess(
      'webpack build',
      run('npx', ['--no-install', 'next', 'build', '--webpack'], workDir),
    );

    rmSync(join(workDir, '.next'), { recursive: true, force: true });
    const turbopack = run('npx', ['--no-install', 'next', 'build'], workDir);

    if (
      turbopack.status !== 0 &&
      turbopack.output.includes(
        "Module not found: Can't resolve '../bridge/' <dynamic>",
      )
    ) {
      console.error(turbopack.output);
      console.error(
        "ISSUE_19982_REPRODUCED: Turbopack cannot resolve the published package's ../bridge/ candidate",
      );
      process.exitCode = 1;
      return;
    }

    requireSuccess('Turbopack build without externalization', turbopack);
    console.log(
      'Issue #19982 did not reproduce: the default Turbopack build succeeded.',
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});

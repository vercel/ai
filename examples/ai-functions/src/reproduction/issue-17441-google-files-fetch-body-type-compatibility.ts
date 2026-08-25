import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function run(command: string, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const result = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    return {
      exitCode: result.code ?? 2,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const typescriptBin = resolve(
    repositoryRoot,
    'packages/svelte/node_modules/typescript/bin/tsc',
  );
  const googleFilesSource = resolve(
    repositoryRoot,
    'packages/google/src/google-files.ts',
  );

  const versionResult = await run(process.execPath, [
    typescriptBin,
    '--version',
  ]);
  if (
    versionResult.exitCode !== 0 ||
    !versionResult.stdout.trim().startsWith('Version 5.9.')
  ) {
    throw new Error(
      `Expected the workspace TypeScript 5.9 compiler, received: ${
        versionResult.stdout || versionResult.stderr
      }`,
    );
  }

  const typeCheckResult = await run(process.execPath, [
    typescriptBin,
    googleFilesSource,
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target',
    'ES2022',
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
    '--lib',
    'ES2022,DOM,DOM.Iterable',
    '--pretty',
    'false',
  ]);
  const compilerOutput =
    `${typeCheckResult.stdout}\n${typeCheckResult.stderr}`.trim();
  const hasReportedDiagnostic =
    compilerOutput.includes('packages/google/src/google-files.ts') &&
    compilerOutput.includes('error TS2769') &&
    compilerOutput.includes(
      "Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BodyInit | null | undefined'.",
    );

  if (hasReportedDiagnostic) {
    console.error(compilerOutput);
    console.error(
      'Issue #17441 reproduced: TypeScript 5.9 rejects the Google Files Uint8Array upload body as BodyInit.',
    );
    process.exitCode = 1;
    return;
  }

  if (typeCheckResult.exitCode !== 0) {
    throw new Error(
      `TypeScript failed for an unexpected reason:\n${compilerOutput}`,
    );
  }

  console.log(
    'TypeScript 5.9 accepts the Google Files upload body as BodyInit.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(2);
});

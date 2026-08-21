import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const expectedFailure =
  "packages/google/src/google-files.ts(110,7): error TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BodyInit | null | undefined'.";

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const typescriptCompiler = resolve(
    repositoryRoot,
    'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc',
  );

  const compiler = spawn(
    process.execPath,
    [
      typescriptCompiler,
      'packages/google/src/google-files.ts',
      '--noEmit',
      '--strict',
      '--target',
      'ES2018',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--lib',
      'dom,dom.iterable,ES2018',
      '--skipLibCheck',
      '--pretty',
      'false',
    ],
    {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  compiler.stdout.on('data', chunk => {
    output += chunk;
  });
  compiler.stderr.on('data', chunk => {
    output += chunk;
  });

  const exitCode = await new Promise<number>((resolveExitCode, reject) => {
    compiler.on('error', reject);
    compiler.on('close', code => resolveExitCode(code ?? 1));
  });

  process.stderr.write(output);

  if (!output.includes(expectedFailure)) {
    throw new Error(
      `Expected the Google Files fetch body type error, but it was not found (tsc exit code ${exitCode}).`,
    );
  }

  process.exitCode = exitCode;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const failureSignal =
  'ISSUE_20615_REPRODUCED: WorkflowAgent.stream({ timeout }) failed before the first model step because AbortSignal.timeout() is not supported in workflow functions.';

async function runFocusedIntegrationTest(): Promise<{
  exitCode: number;
  output: string;
}> {
  const repositoryRoot = fileURLToPath(
    new URL('../../../../', import.meta.url),
  );
  const child = spawn(
    'pnpm',
    [
      '-C',
      'packages/workflow',
      'exec',
      'vitest',
      '--config',
      'vitest.integration.config.mjs',
      '--run',
      '-t',
      'completes within timeout',
      'src/workflow-agent-e2e.integration.test.ts',
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });

  return { exitCode, output };
}

async function main() {
  const result = await runFocusedIntegrationTest();

  if (result.exitCode === 0) {
    console.log(
      'WorkflowAgent.stream({ timeout }) completed its first model step.',
    );
    return;
  }

  const runtimeError =
    'AbortSignal.timeout() is not supported in workflow functions.';
  if (
    result.output.includes(runtimeError) &&
    result.output.includes('USER_ERROR')
  ) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  console.error(result.output);
  throw new Error(
    'The focused integration test failed without the issue #20615 runtime error.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

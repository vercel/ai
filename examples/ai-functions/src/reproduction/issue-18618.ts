import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FAILURE_SIGNAL =
  'ISSUE_18618_PRIMARY_FAILURE: finish-step usage used subagent tokens; subagent tool events leaked into the main step';

async function main(): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  const child = spawn(
    'pnpm',
    [
      '-C',
      `${repositoryRoot}/packages/harness-claude-code`,
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/issue-18618-reproduction.test.ts',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout.on('data', chunk => {
    const text = String(chunk);
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', chunk => {
    const text = String(chunk);
    output += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });

  if (exitCode === 0) {
    return;
  }
  if (!output.includes(FAILURE_SIGNAL)) {
    throw new Error(
      `Focused reproduction failed without the expected issue signal (exit ${exitCode}).`,
    );
  }
  process.exitCode = exitCode;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { createPi } from '@ai-sdk/harness-pi';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

createPi({
  thinkingLevel: 'max',
});

async function main() {
  try {
    await execFileAsync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'es2022',
        '--module',
        'esnext',
        '--moduleResolution',
        'Bundler',
        '--types',
        'node',
        fileURLToPath(import.meta.url),
      ],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
      },
    );
  } catch (error) {
    const output =
      typeof error === 'object' && error != null
        ? `${'stdout' in error ? error.stdout : ''}${
            'stderr' in error ? error.stderr : ''
          }`
        : String(error);

    if (
      output.includes(
        `Type '"max"' is not assignable to type 'PiThinkingLevel | undefined'`,
      )
    ) {
      console.error(
        `BUG REPRODUCED: @ai-sdk/harness-pi rejects thinkingLevel: 'max'.`,
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log(`@ai-sdk/harness-pi accepts thinkingLevel: 'max'.`);
}

await main();

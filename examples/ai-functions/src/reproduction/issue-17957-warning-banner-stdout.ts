import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateText } from '../../../../packages/ai/dist/index.mjs';

const banner =
  'AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.';

async function runWarningProducingCalls() {
  const answers = [];

  for (const [answer, warning] of [
    ['first complete answer', 'first provider warning'],
    ['second complete answer', 'second provider warning'],
  ] as const) {
    const result = await generateText({
      model: {
        specificationVersion: 'v2',
        provider: 'issue-17957-reproduction',
        modelId: 'warning-producing-model',
        supportedUrls: {},
        doGenerate: async () => ({
          content: [{ type: 'text', text: answer }],
          finishReason: 'stop',
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
          },
          warnings: [{ type: 'other', message: warning }],
        }),
        doStream: async () => {
          throw new Error('Streaming is not used by this reproduction.');
        },
      },
      prompt: 'Return a complete answer',
    });

    answers.push(result.text);
  }

  process.stdout.write(`${JSON.stringify({ answers })}\n`);
}

async function main() {
  if (process.argv.includes('--worker')) {
    await runWarningProducingCalls();
    return;
  }

  const child = spawnSync(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), '--worker'],
    { encoding: 'utf8' },
  );

  if (child.status !== 0) {
    throw new Error(
      `Worker failed before the warning routing assertion: ${child.stderr}`,
    );
  }

  const bannerCount = child.stdout.split(banner).length - 1;
  if (bannerCount !== 1) {
    throw new Error(
      `Expected exactly one first-warning banner on stdout, received ${bannerCount}.`,
    );
  }

  for (const warning of [
    'AI SDK Warning: first provider warning',
    'AI SDK Warning: second provider warning',
  ]) {
    if (!child.stderr.includes(warning)) {
      throw new Error(`Expected stderr to contain: ${warning}`);
    }
  }

  try {
    JSON.parse(child.stdout);
  } catch {
    const jsonOnlyStdout = child.stdout.replace(`${banner}\n`, '');
    const parsed = JSON.parse(jsonOnlyStdout) as { answers: string[] };

    if (
      parsed.answers.join('|') !==
      'first complete answer|second complete answer'
    ) {
      throw new Error(
        'The JSON payload was not complete after banner removal.',
      );
    }

    throw new Error(
      'ISSUE_17957_REPRODUCED: warning banner on stdout corrupts valid JSON output',
    );
  }

  throw new Error(
    'Expected warning diagnostics to make raw stdout invalid JSON, but parsing succeeded.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

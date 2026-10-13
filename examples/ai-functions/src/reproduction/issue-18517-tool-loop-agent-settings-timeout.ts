import assert from 'node:assert/strict';
import { ToolLoopAgent } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const TIMEOUT_MS = 50;
const MODEL_DELAY_MS = 300;

function delayWithAbort(abortSignal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, MODEL_DELAY_MS);

    const abort = () => {
      clearTimeout(timer);
      reject(abortSignal?.reason ?? new Error('aborted'));
    };

    if (abortSignal?.aborted) {
      abort();
      return;
    }

    abortSignal?.addEventListener('abort', abort, { once: true });
  });
}

function slowModel() {
  return new MockLanguageModelV3({
    doGenerate: async ({ abortSignal }) => {
      await delayWithAbort(abortSignal);

      return {
        content: [{ type: 'text', text: 'done' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
        warnings: [],
      };
    },
    doStream: async ({ abortSignal }) => {
      await delayWithAbort(abortSignal);

      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'done',
            });
            controller.enqueue({ type: 'text-end', id: 'text-1' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 1,
                  text: 1,
                  reasoning: undefined,
                },
              },
            });
            controller.close();
          },
        }),
      };
    },
  });
}

async function expectTimeout(
  label: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  let error: unknown;

  try {
    await operation();
  } catch (caught) {
    error = caught;
  }

  assert.notEqual(
    error,
    undefined,
    `Issue #18517 reproduced: ${label} completed after ${MODEL_DELAY_MS}ms instead of enforcing the ${TIMEOUT_MS}ms timeout`,
  );
  assert.equal(
    (error as Error).name,
    'TimeoutError',
    `${label} failed for a reason other than the configured timeout`,
  );
}

async function runGenerateCases(): Promise<void> {
  await expectTimeout('generate settings-level timeout', async () => {
    await new ToolLoopAgent({
      model: slowModel(),
      maxRetries: 0,
      timeout: TIMEOUT_MS,
    }).generate({ prompt: 'hi' });
  });

  await expectTimeout('generate per-call timeout', async () => {
    await new ToolLoopAgent({
      model: slowModel(),
      maxRetries: 0,
    }).generate({ prompt: 'hi', timeout: TIMEOUT_MS });
  });

  await expectTimeout('generate prepareCall timeout', async () => {
    await new ToolLoopAgent({
      model: slowModel(),
      maxRetries: 0,
      timeout: TIMEOUT_MS,
      prepareCall: options => ({ ...options }),
    }).generate({ prompt: 'hi' });
  });
}

async function runStreamCases(): Promise<void> {
  await expectTimeout('stream settings-level timeout', async () => {
    const result = await new ToolLoopAgent({
      model: slowModel(),
      maxRetries: 0,
      timeout: TIMEOUT_MS,
    }).stream({ prompt: 'hi' });

    await result.text;
  });

  await expectTimeout('stream per-call timeout', async () => {
    const result = await new ToolLoopAgent({
      model: slowModel(),
      maxRetries: 0,
    }).stream({ prompt: 'hi', timeout: TIMEOUT_MS });

    await result.text;
  });

  await expectTimeout('stream prepareCall timeout', async () => {
    const result = await new ToolLoopAgent({
      model: slowModel(),
      maxRetries: 0,
      timeout: TIMEOUT_MS,
      prepareCall: options => ({ ...options }),
    }).stream({ prompt: 'hi' });

    await result.text;
  });
}

async function main(): Promise<void> {
  await runGenerateCases();
  await runStreamCases();
  console.log(
    'Issue #18517 could not be reproduced: settings-level, per-call, and prepareCall timeouts were enforced for generate and stream.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const timeoutMs = 25;
const modelDelayMs = 120;

const usage: LanguageModelV4Usage = {
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
};

function waitForModel(abortSignal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, modelDelayMs);

    abortSignal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortSignal.reason);
      },
      { once: true },
    );
  });
}

function slowGenerateModel() {
  return new MockLanguageModelV4({
    doGenerate: async ({ abortSignal }) => {
      await waitForModel(abortSignal);

      return {
        content: [{ type: 'text' as const, text: 'done' }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

function slowStreamModel() {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          const timer = setTimeout(() => {
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
              usage,
            });
            controller.close();
          }, modelDelayMs);

          abortSignal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              controller.error(abortSignal.reason);
            },
            { once: true },
          );
        },
      }),
    }),
  });
}

async function main() {
  const failures: string[] = [];

  async function expectTimeout(
    label: string,
    operation: () => Promise<unknown>,
  ) {
    try {
      await operation();
      failures.push(`${label} resolved instead of timing out`);
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.log(`${label}: timed out as expected`);
        return;
      }

      throw error;
    }
  }

  await expectTimeout('generate per-call timeout control', () =>
    new ToolLoopAgent({
      model: slowGenerateModel(),
      maxRetries: 0,
    }).generate({
      prompt: 'hi',
      timeout: timeoutMs,
    }),
  );

  await expectTimeout('generate settings timeout', () =>
    new ToolLoopAgent({
      model: slowGenerateModel(),
      maxRetries: 0,
      timeout: timeoutMs,
    }).generate({ prompt: 'hi' }),
  );

  await expectTimeout('generate prepareCall settings timeout', () =>
    new ToolLoopAgent({
      model: slowGenerateModel(),
      maxRetries: 0,
      timeout: timeoutMs,
      prepareCall: options => ({ ...options }),
    }).generate({ prompt: 'hi' }),
  );

  await expectTimeout('stream per-call timeout control', async () => {
    const result = await new ToolLoopAgent({
      model: slowStreamModel(),
      maxRetries: 0,
    }).stream({
      prompt: 'hi',
      timeout: timeoutMs,
    });

    await result.text;
  });

  await expectTimeout('stream settings timeout', async () => {
    const result = await new ToolLoopAgent({
      model: slowStreamModel(),
      maxRetries: 0,
      timeout: timeoutMs,
    }).stream({ prompt: 'hi' });

    await result.text;
  });

  await expectTimeout('stream prepareCall settings timeout', async () => {
    const result = await new ToolLoopAgent({
      model: slowStreamModel(),
      maxRetries: 0,
      timeout: timeoutMs,
      prepareCall: options => ({ ...options }),
    }).stream({ prompt: 'hi' });

    await result.text;
  });

  if (failures.length > 0) {
    throw new Error(`ISSUE #18517 REPRODUCED: ${failures.join('; ')}`);
  }
}

main();

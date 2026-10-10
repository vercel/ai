import assert from 'node:assert/strict';
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { convertJsonResponseToolStream } from '@ai-sdk/provider-utils';
import { Output, streamText } from 'ai';

async function runScenario(withToolInputStart: boolean) {
  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('doGenerate is not used by this reproduction');
    },
    async doStream() {
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });

            if (withToolInputStart) {
              controller.enqueue({
                type: 'tool-input-start',
                id: 'c',
                toolName: 'json',
              });
            }

            controller.enqueue({
              type: 'tool-call',
              toolCallId: 'c',
              toolName: 'json',
              input: '{"ok":true}',
            });
            controller.enqueue({
              type: 'finish',
              finishReason: {
                unified: 'tool-calls',
                raw: 'tool_calls',
              },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: undefined,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 1,
                  text: undefined,
                  reasoning: undefined,
                },
              },
            });
            controller.close();
          },
        }).pipeThrough(convertJsonResponseToolStream('json')),
      };
    },
  };

  const errors: string[] = [];
  let text = '';
  const result = streamText({
    model,
    prompt: 'Return JSON',
    output: Output.json(),
    onError() {},
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    } else if (part.type === 'error') {
      errors.push(String(part.error));
    }
  }

  return { withToolInputStart, text, errors };
}

async function main() {
  const control = await runScenario(true);
  const finalOnly = await runScenario(false);

  console.log(JSON.stringify({ control, finalOnly }, null, 2));

  assert.deepEqual(control, {
    withToolInputStart: true,
    text: '{"ok":true}',
    errors: [],
  });
  assert.equal(finalOnly.text, '{"ok":true}');
  assert.deepEqual(
    finalOnly.errors,
    [],
    'ISSUE_22705: final-only response tool must stream JSON without text lifecycle errors',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

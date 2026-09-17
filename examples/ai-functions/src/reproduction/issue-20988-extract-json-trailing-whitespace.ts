import assert from 'node:assert/strict';
import {
  extractJsonMiddleware,
  generateText,
  NoObjectGeneratedError,
  Output,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const expectedObject = { value: 'example' };
const json = '{"value":"example"}';
const fencedJson = `\`\`\`json\n${json}\n\`\`\``;
const leakedFenceText = `${json}\n\`\`\``;
const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const scenarios = [
  {
    name: 'single delta with trailing spaces',
    text: fencedJson + ' '.repeat(10),
    chunks: (text: string) => [text],
  },
  {
    name: 'character deltas with trailing spaces',
    text: fencedJson + ' '.repeat(10),
    chunks: (text: string) => [...text],
  },
  {
    name: 'split suffix with trailing spaces',
    text: fencedJson + ' '.repeat(10),
    chunks: () => [`\`\`\`json\n${json}\n`, '```', ' '.repeat(10)],
  },
  {
    name: 'single delta with trailing newlines',
    text: fencedJson + '\n'.repeat(10),
    chunks: (text: string) => [text],
  },
  {
    name: 'character deltas with trailing newlines',
    text: fencedJson + '\n'.repeat(10),
    chunks: (text: string) => [...text],
  },
  {
    name: 'split suffix with trailing newlines',
    text: fencedJson + '\n'.repeat(10),
    chunks: () => [`\`\`\`json\n${json}\n`, '```', '\n'.repeat(10)],
  },
] as const;

function createModel(text: string, chunks: readonly string[]) {
  return wrapLanguageModel({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
      doStream: {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't' });
            for (const delta of chunks) {
              controller.enqueue({ type: 'text-delta', id: 't', delta });
            }
            controller.enqueue({ type: 'text-end', id: 't' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            });
            controller.close();
          },
        }),
      },
    }),
    middleware: extractJsonMiddleware(),
  });
}

async function runScenario(scenario: (typeof scenarios)[number]) {
  const options = {
    model: createModel(scenario.text, scenario.chunks(scenario.text)),
    prompt: 'Return the synthetic example as JSON.',
    output: Output.object({
      schema: z.object({ value: z.string() }),
    }),
    maxRetries: 0,
  };

  const generated = await generateText(options);
  assert.deepEqual(
    generated.output,
    expectedObject,
    `${scenario.name}: generateText must parse the fenced JSON`,
  );

  const streamed = streamText(options);
  const [outputResult, textResult] = await Promise.allSettled([
    streamed.output,
    streamed.text,
  ]);

  assert.equal(
    textResult.status,
    'fulfilled',
    `${scenario.name}: streamed text must be available`,
  );

  if (
    outputResult.status === 'rejected' &&
    NoObjectGeneratedError.isInstance(outputResult.reason) &&
    textResult.status === 'fulfilled' &&
    textResult.value === leakedFenceText
  ) {
    return {
      name: scenario.name,
      error: outputResult.reason.name,
      streamedText: textResult.value,
      reproduced: true,
    };
  }

  assert.equal(
    outputResult.status,
    'fulfilled',
    `${scenario.name}: streamText must produce an object`,
  );
  assert.deepEqual(
    outputResult.value,
    expectedObject,
    `${scenario.name}: streamText must parse the fenced JSON`,
  );
  assert.equal(
    textResult.value,
    json,
    `${scenario.name}: streamText must remove the closing fence and trailing whitespace`,
  );

  return {
    name: scenario.name,
    reproduced: false,
  };
}

async function main() {
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  const reproduced = results.filter(result => result.reproduced);
  if (reproduced.length > 0) {
    for (const result of reproduced) {
      console.error(
        `${result.name}: ${result.error}; streamed text ${JSON.stringify(result.streamedText)}`,
      );
    }
    throw new Error(
      `ISSUE_20988_REPRODUCED: streamText failed to parse valid fenced JSON and leaked the closing fence in ${reproduced.length} trailing-whitespace scenarios`,
    );
  }

  console.log(
    'All trailing-whitespace scenarios produced the expected object.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';

const usage = {
  cachedInputTokens: undefined,
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

function generateResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
  };
}

function streamResult(label: string): LanguageModelV3StreamResult {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: label });
        controller.enqueue({
          type: 'text-delta',
          id: label,
          delta: label,
        });
        controller.enqueue({ type: 'text-end', id: label });
        controller.close();
      },
    }),
  };
}

async function main() {
  const generateA = generateResult('GENERATE_A');
  const generateB = generateResult('GENERATE_B');
  const generateModel = new MockLanguageModelV3({
    doGenerate: [generateA, generateB],
  });

  assert.strictEqual(
    await generateModel.doGenerate({ prompt: [] }),
    generateA,
    'doGenerate call 1 must return array element 0',
  );
  assert.strictEqual(
    await generateModel.doGenerate({ prompt: [] }),
    generateB,
    'doGenerate call 2 must return array element 1',
  );

  const singleGenerate = new MockLanguageModelV3({
    doGenerate: [generateA],
  });
  assert.strictEqual(
    await singleGenerate.doGenerate({ prompt: [] }),
    generateA,
    'single-element doGenerate must return element 0 on call 1',
  );

  const streamA = streamResult('STREAM_A');
  const streamB = streamResult('STREAM_B');
  const streamModel = new MockLanguageModelV3({
    doStream: [streamA, streamB],
  });

  assert.strictEqual(
    await streamModel.doStream({ prompt: [] }),
    streamA,
    'doStream call 1 must return array element 0',
  );
  assert.strictEqual(
    await streamModel.doStream({ prompt: [] }),
    streamB,
    'doStream call 2 must return array element 1',
  );

  const singleStream = new MockLanguageModelV3({
    doStream: [streamA],
  });
  assert.strictEqual(
    await singleStream.doStream({ prompt: [] }),
    streamA,
    'single-element doStream must return element 0 on call 1',
  );

  console.log(
    'PASS: MockLanguageModelV3 array-backed doGenerate/doStream results start at element 0 and do not return undefined within the configured sequence.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

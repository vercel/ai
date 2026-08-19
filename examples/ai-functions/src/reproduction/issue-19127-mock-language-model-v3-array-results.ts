import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';

const callOptions: LanguageModelV3CallOptions = { prompt: [] };

function generateResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { raw: undefined, unified: 'stop' },
    usage: {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 0,
        text: 0,
        reasoning: undefined,
      },
    },
    warnings: [],
  };
}

function streamResult(): LanguageModelV3StreamResult {
  return { stream: new ReadableStream() };
}

function label<T>(
  value: T | undefined,
  first: T,
  second?: T,
): 'A' | 'B' | 'undefined' | 'unexpected' {
  if (value === first) {
    return 'A';
  }
  if (second !== undefined && value === second) {
    return 'B';
  }
  return value === undefined ? 'undefined' : 'unexpected';
}

async function main() {
  const generateA = generateResult('GENERATE_A');
  const generateB = generateResult('GENERATE_B');
  const generateModel = new MockLanguageModelV3({
    doGenerate: [generateA, generateB],
  });
  const generateActual = [
    label(await generateModel.doGenerate(callOptions), generateA, generateB),
    label(await generateModel.doGenerate(callOptions), generateA, generateB),
  ];

  const singleGenerateModel = new MockLanguageModelV3({
    doGenerate: [generateA],
  });
  const singleGenerateActual = label(
    await singleGenerateModel.doGenerate(callOptions),
    generateA,
  );

  const streamA = streamResult();
  const streamB = streamResult();
  const streamModel = new MockLanguageModelV3({
    doStream: [streamA, streamB],
  });
  const streamActual = [
    label(await streamModel.doStream(callOptions), streamA, streamB),
    label(await streamModel.doStream(callOptions), streamA, streamB),
  ];

  const singleStreamModel = new MockLanguageModelV3({
    doStream: [streamA],
  });
  const singleStreamActual = label(
    await singleStreamModel.doStream(callOptions),
    streamA,
  );

  const actual = {
    generate: generateActual,
    singleGenerate: singleGenerateActual,
    stream: streamActual,
    singleStream: singleStreamActual,
  };
  const expected = {
    generate: ['A', 'B'],
    singleGenerate: 'A',
    stream: ['A', 'B'],
    singleStream: 'A',
  };
  const reportedBug = {
    generate: ['B', 'undefined'],
    singleGenerate: 'undefined',
    stream: ['B', 'undefined'],
    singleStream: 'undefined',
  };

  if (JSON.stringify(actual) === JSON.stringify(reportedBug)) {
    console.error(
      'ISSUE #19127 REPRODUCED: MockLanguageModelV3 array results skip element 0 and then return undefined',
    );
    console.error(`Expected: ${JSON.stringify(expected)}`);
    console.error(`Actual:   ${JSON.stringify(actual)}`);
    process.exitCode = 1;
    return;
  }

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected MockLanguageModelV3 array behavior: ${JSON.stringify(actual)}`,
    );
  }

  console.log('MockLanguageModelV3 array results replay in zero-based order.');
}

main();

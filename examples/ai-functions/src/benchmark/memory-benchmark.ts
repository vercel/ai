import { generateText, streamText } from 'ai';
import { MockLanguageModelV3 } from '../../../../packages/ai/src/test/mock-language-model-v3';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { LanguageModelV3Usage } from '@ai-sdk/provider';

// Simulate large request/response bodies (like base64-encoded images)
const BODY_SIZE_KB = 500; // 500KB per body (simulates ~375KB image in base64)
const NUM_CALLS = 10;

function createLargeBody(sizeKB: number): string {
  return 'x'.repeat(sizeKB * 1024);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getMemoryUsage(): number {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed;
}

const testUsage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

type RetentionConfig = {
  requestBody?: boolean;
  responseBody?: boolean;
};

async function runGenerateTextBenchmark(
  retention?: RetentionConfig,
): Promise<{ memory: number; reqBodies: number; resBodies: number }> {
  const results: any[] = [];

  for (let i = 0; i < NUM_CALLS; i++) {
    // Create unique bodies for each call to prevent string interning
    const reqBody = createLargeBody(BODY_SIZE_KB) + i;
    const resBody = createLargeBody(BODY_SIZE_KB) + i + 'res';

    const result = await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: testUsage,
          warnings: [],
          content: [{ type: 'text', text: 'Hello' }],
          request: { body: reqBody },
          response: {
            id: `test-${i}`,
            timestamp: new Date(),
            modelId: 'test-model',
            body: resBody,
          },
        }),
      }),
      prompt: 'test prompt',
      ...(retention ? { experimental_retention: retention } : {}),
    });
    results.push(result);
  }

  // Measure memory BEFORE GC to capture retained data
  const memoryBeforeGc = process.memoryUsage().heapUsed;

  const reqBodies = results.filter(r => r.request.body !== undefined).length;
  const resBodies = results.filter(r => r.response.body !== undefined).length;

  // Calculate actual retained size
  const reqBodySize = results.reduce(
    (sum, r) => sum + (r.request.body?.length ?? 0),
    0,
  );
  const resBodySize = results.reduce(
    (sum, r) => sum + (r.response.body?.length ?? 0),
    0,
  );

  return {
    memory: memoryBeforeGc,
    reqBodies,
    resBodies,
    reqBodySize,
    resBodySize,
  };
}

async function runStreamTextBenchmark(
  retention?: RetentionConfig,
): Promise<{ memory: number; reqBodies: number; reqBodySize: number }> {
  const results: any[] = [];

  for (let i = 0; i < NUM_CALLS; i++) {
    // Create unique body for each call to prevent string interning
    const reqBody = createLargeBody(BODY_SIZE_KB) + i;

    const result = streamText({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: `id-${i}`,
              modelId: 'mock-model',
              timestamp: new Date(),
            },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
          request: { body: reqBody },
        }),
      }),
      prompt: 'test prompt',
      ...(retention ? { experimental_retention: retention } : {}),
    });

    await result.text;
    results.push({ request: await result.request });
  }

  // Measure memory BEFORE GC to capture retained data
  const memoryBeforeGc = process.memoryUsage().heapUsed;

  const reqBodies = results.filter(r => r.request.body !== undefined).length;
  const reqBodySize = results.reduce(
    (sum, r) => sum + (r.request.body?.length ?? 0),
    0,
  );

  return { memory: memoryBeforeGc, reqBodies, reqBodySize };
}

async function gcAndWait(): Promise<number> {
  if (global.gc) global.gc();
  await new Promise(r => setTimeout(r, 100));
  return getMemoryUsage();
}

async function main() {
  console.log('='.repeat(70));
  console.log('Memory Benchmark: experimental_retention option');
  console.log('='.repeat(70));
  console.log(`Body size: ${BODY_SIZE_KB} KB each`);
  console.log(`Number of calls: ${NUM_CALLS}`);
  console.log(
    `Expected data per call: ${BODY_SIZE_KB} KB request + ${BODY_SIZE_KB} KB response = ${BODY_SIZE_KB * 2} KB`,
  );
  console.log(`Expected total: ${(BODY_SIZE_KB * 2 * NUM_CALLS) / 1024} MB`);
  console.log('');

  // ============== generateText benchmarks ==============
  console.log('='.repeat(70));
  console.log('generateText Benchmarks');
  console.log('='.repeat(70));

  // Test 1: Default (both retained)
  let baseline = await gcAndWait();
  const defaultResult = await runGenerateTextBenchmark();
  console.log('\n1. Default (both bodies retained):');
  console.log(
    `   Memory delta: ${formatBytes(defaultResult.memory - baseline)}`,
  );
  console.log(
    `   Request bodies: ${defaultResult.reqBodies}/${NUM_CALLS} (${formatBytes(defaultResult.reqBodySize)})`,
  );
  console.log(
    `   Response bodies: ${defaultResult.resBodies}/${NUM_CALLS} (${formatBytes(defaultResult.resBodySize)})`,
  );

  // Test 2: requestBody: false only
  baseline = await gcAndWait();
  const reqFalseResult = await runGenerateTextBenchmark({ requestBody: false });
  console.log('\n2. experimental_retention: { requestBody: false }:');
  console.log(
    `   Memory delta: ${formatBytes(reqFalseResult.memory - baseline)}`,
  );
  console.log(
    `   Request bodies: ${reqFalseResult.reqBodies}/${NUM_CALLS} (${formatBytes(reqFalseResult.reqBodySize)})`,
  );
  console.log(
    `   Response bodies: ${reqFalseResult.resBodies}/${NUM_CALLS} (${formatBytes(reqFalseResult.resBodySize)})`,
  );

  // Test 3: responseBody: false only
  baseline = await gcAndWait();
  const resFalseResult = await runGenerateTextBenchmark({
    responseBody: false,
  });
  console.log('\n3. experimental_retention: { responseBody: false }:');
  console.log(
    `   Memory delta: ${formatBytes(resFalseResult.memory - baseline)}`,
  );
  console.log(
    `   Request bodies: ${resFalseResult.reqBodies}/${NUM_CALLS} (${formatBytes(resFalseResult.reqBodySize)})`,
  );
  console.log(
    `   Response bodies: ${resFalseResult.resBodies}/${NUM_CALLS} (${formatBytes(resFalseResult.resBodySize)})`,
  );

  // Test 4: Both false
  baseline = await gcAndWait();
  const bothFalseResult = await runGenerateTextBenchmark({
    requestBody: false,
    responseBody: false,
  });
  console.log(
    '\n4. experimental_retention: { requestBody: false, responseBody: false }:',
  );
  console.log(
    `   Memory delta: ${formatBytes(bothFalseResult.memory - baseline)}`,
  );
  console.log(
    `   Request bodies: ${bothFalseResult.reqBodies}/${NUM_CALLS} (${formatBytes(bothFalseResult.reqBodySize)})`,
  );
  console.log(
    `   Response bodies: ${bothFalseResult.resBodies}/${NUM_CALLS} (${formatBytes(bothFalseResult.resBodySize)})`,
  );

  // ============== streamText benchmarks ==============
  console.log('\n');
  console.log('='.repeat(70));
  console.log('streamText Benchmarks');
  console.log('='.repeat(70));

  // Test 1: Default (requestBody retained)
  baseline = await gcAndWait();
  const streamDefaultResult = await runStreamTextBenchmark();
  console.log('\n1. Default (requestBody retained):');
  console.log(
    `   Memory delta: ${formatBytes(streamDefaultResult.memory - baseline)}`,
  );
  console.log(
    `   Request bodies: ${streamDefaultResult.reqBodies}/${NUM_CALLS} (${formatBytes(streamDefaultResult.reqBodySize)})`,
  );

  // Test 2: requestBody: false
  baseline = await gcAndWait();
  const streamReqFalseResult = await runStreamTextBenchmark({
    requestBody: false,
  });
  console.log('\n2. experimental_retention: { requestBody: false }:');
  console.log(
    `   Memory delta: ${formatBytes(streamReqFalseResult.memory - baseline)}`,
  );
  console.log(
    `   Request bodies: ${streamReqFalseResult.reqBodies}/${NUM_CALLS} (${formatBytes(streamReqFalseResult.reqBodySize)})`,
  );

  // ============== Summary ==============
  console.log('\n');
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log('\ngenerateText:');
  console.log(
    '  | Setting                    | Req Bodies | Req Size   | Res Bodies | Res Size   |',
  );
  console.log(
    '  |----------------------------|------------|------------|------------|------------|',
  );
  console.log(
    `  | Default (both true)        | ${defaultResult.reqBodies}/${NUM_CALLS}       | ${formatBytes(defaultResult.reqBodySize).padEnd(10)} | ${defaultResult.resBodies}/${NUM_CALLS}       | ${formatBytes(defaultResult.resBodySize).padEnd(10)} |`,
  );
  console.log(
    `  | requestBody: false         | ${reqFalseResult.reqBodies}/${NUM_CALLS}        | ${formatBytes(reqFalseResult.reqBodySize).padEnd(10)} | ${reqFalseResult.resBodies}/${NUM_CALLS}       | ${formatBytes(reqFalseResult.resBodySize).padEnd(10)} |`,
  );
  console.log(
    `  | responseBody: false        | ${resFalseResult.reqBodies}/${NUM_CALLS}       | ${formatBytes(resFalseResult.reqBodySize).padEnd(10)} | ${resFalseResult.resBodies}/${NUM_CALLS}        | ${formatBytes(resFalseResult.resBodySize).padEnd(10)} |`,
  );
  console.log(
    `  | Both false                 | ${bothFalseResult.reqBodies}/${NUM_CALLS}        | ${formatBytes(bothFalseResult.reqBodySize).padEnd(10)} | ${bothFalseResult.resBodies}/${NUM_CALLS}        | ${formatBytes(bothFalseResult.resBodySize).padEnd(10)} |`,
  );

  console.log('\nstreamText:');
  console.log('  | Setting                    | Req Bodies | Req Size   |');
  console.log('  |----------------------------|------------|------------|');
  console.log(
    `  | Default (requestBody: true)| ${streamDefaultResult.reqBodies}/${NUM_CALLS}       | ${formatBytes(streamDefaultResult.reqBodySize).padEnd(10)} |`,
  );
  console.log(
    `  | requestBody: false         | ${streamReqFalseResult.reqBodies}/${NUM_CALLS}        | ${formatBytes(streamReqFalseResult.reqBodySize).padEnd(10)} |`,
  );

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);

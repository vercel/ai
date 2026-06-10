import {
  createStreamingUIMessageState,
  processUIMessageStream,
} from '../src/ui/process-ui-message-stream';
import type { UIMessageChunk } from '../src/ui-message-stream/ui-message-chunks';
import type { UIMessage } from '../src/ui/ui-messages';

const DEFAULT_CHUNK_COUNT = 10_000;
const DEFAULT_CHUNK_SIZE = 200;
const DEFAULT_ITERATIONS = 5;

// Usage:
//   pnpm tsx packages/ai/scripts/process-ui-message-stream-benchmark.ts [chunks] [chunk-size] [iterations]
//
// To compare this branch with main, run the same script from this branch and
// from a main worktree that contains a copy of the script.
const chunkCount = readPositiveIntegerArgument(2, DEFAULT_CHUNK_COUNT);
const chunkSize = readPositiveIntegerArgument(3, DEFAULT_CHUNK_SIZE);
const iterations = readPositiveIntegerArgument(4, DEFAULT_ITERATIONS);
const summaryOnly = process.argv.includes('--summary-only');
const textDelta = 'x'.repeat(chunkSize);

type BenchmarkResult = {
  elapsedMs: number;
  outputChunks: number;
  writeCalls: number;
  finalTextLength: number;
};

function readPositiveIntegerArgument(index: number, fallback: number) {
  const value = process.argv[index];

  if (value == null) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Argument ${index - 1} must be a positive integer. Received: ${value}`,
    );
  }

  return parsed;
}

function createBenchmarkStream() {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'text-start', id: '1' });

      for (let i = 0; i < chunkCount; i++) {
        controller.enqueue({
          type: 'text-delta',
          id: '1',
          delta: textDelta,
        });
      }

      controller.enqueue({ type: 'text-end', id: '1' });
      controller.close();
    },
  });
}

async function consumeProcessedStream(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();
  let outputChunks = 0;

  try {
    while (true) {
      const { done } = await reader.read();

      if (done) {
        break;
      }

      outputChunks++;
    }
  } finally {
    reader.releaseLock();
  }

  return outputChunks;
}

async function runBenchmark(): Promise<BenchmarkResult> {
  const state = createStreamingUIMessageState<UIMessage>({
    lastMessage: undefined,
    messageId: 'm1',
  });
  let writeCalls = 0;

  const startTime = performance.now();
  const processedStream = processUIMessageStream({
    stream: createBenchmarkStream(),
    runUpdateMessageJob: async job =>
      job({
        state,
        write: () => {
          writeCalls++;
        },
      }),
    onError: error => {
      throw error;
    },
  });

  const outputChunks = await consumeProcessedStream(processedStream);
  const elapsedMs = performance.now() - startTime;
  const [textPart] = state.message.parts;

  if (textPart?.type !== 'text') {
    throw new Error('Expected a text part to be created.');
  }

  return {
    elapsedMs,
    outputChunks,
    writeCalls,
    finalTextLength: textPart.text.length,
  };
}

function summarize(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const average = times.reduce((sum, time) => sum + time, 0) / times.length;
  const variance =
    times.reduce((sum, time) => sum + (time - average) ** 2, 0) /
    (times.length - 1);

  return {
    average,
    max: Math.max(...times),
    median,
    min: Math.min(...times),
    standardDeviation: Math.sqrt(variance),
  };
}

console.log('processUIMessageStream text delta benchmark');
console.log(`  chunks: ${chunkCount.toLocaleString()}`);
console.log(`  chunk size: ${chunkSize.toLocaleString()} chars`);
console.log(`  total text: ${(chunkCount * chunkSize).toLocaleString()} chars`);
console.log(`  iterations: ${iterations.toLocaleString()}`);
console.log();

const results: BenchmarkResult[] = [];

for (let i = 0; i < iterations; i++) {
  const result = await runBenchmark();
  results.push(result);

  if (!summaryOnly) {
    console.log(`Run ${i + 1}: ${result.elapsedMs.toFixed(0)} ms`);
  }
}

const stats = summarize(results.map(result => result.elapsedMs));
const firstResult = results[0];

console.log();
console.log('--- Statistics ---');
console.log(`Median: ${stats.median.toFixed(0)} ms`);
console.log(`Average: ${stats.average.toFixed(0)} ms`);
console.log(`Std dev: ${stats.standardDeviation.toFixed(2)} ms`);
console.log(`Min: ${stats.min.toFixed(0)} ms`);
console.log(`Max: ${stats.max.toFixed(0)} ms`);
console.log(
  `Throughput: ${(
    (chunkCount * chunkSize) /
    (stats.median / 1000) /
    (1024 * 1024)
  ).toFixed(2)} MB/s`,
);
console.log();
console.log('--- Validation ---');
console.log(`Output chunks: ${firstResult.outputChunks.toLocaleString()}`);
console.log(`Write calls: ${firstResult.writeCalls.toLocaleString()}`);
console.log(
  `Final text length: ${firstResult.finalTextLength.toLocaleString()}`,
);
console.log();
console.log('Compare with main by running the same script in both worktrees:');
console.log(
  '  pnpm tsx packages/ai/scripts/process-ui-message-stream-benchmark.ts',
);

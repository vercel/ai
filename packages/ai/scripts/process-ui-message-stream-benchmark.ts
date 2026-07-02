import {
  createStreamingUIMessageState,
  processUIMessageStream,
} from '../src/ui/process-ui-message-stream';
import type { UIMessageChunk } from '../src/ui-message-stream/ui-message-chunks';
import type { UIMessage } from '../src/ui/ui-messages';

const DEFAULT_CHUNK_COUNT = 10_000;
const DEFAULT_CHUNK_SIZE = 200;
const DEFAULT_ITERATIONS = 5;
const DEFAULT_SWEEP_ITERATIONS = 20;

// Usage:
//   pnpm tsx packages/ai/scripts/process-ui-message-stream-benchmark.ts [chunks] [chunk-size] [iterations]
//   pnpm tsx packages/ai/scripts/process-ui-message-stream-benchmark.ts --sweep [iterations]
//   pnpm tsx packages/ai/scripts/process-ui-message-stream-benchmark.ts --high-chunk-count-sweep [iterations]
//
// To compare this branch with main, run the same script from this branch and
// from a main worktree that contains a copy of the script.
const sweep = process.argv.includes('--sweep');
const highChunkCountSweep = process.argv.includes('--high-chunk-count-sweep');
const summaryOnly = process.argv.includes('--summary-only');
const positionalArguments = process.argv
  .slice(2)
  .filter(argument => !argument.startsWith('--'));

type Workload = {
  chunkCount: number;
  chunkSize: number;
  iterations: number;
};

const workloads = highChunkCountSweep
  ? [
      { chunkCount: 50_000, chunkSize: 20 },
      { chunkCount: 100_000, chunkSize: 20 },
      { chunkCount: 150_000, chunkSize: 20 },
      { chunkCount: 200_000, chunkSize: 20 },
      { chunkCount: 250_000, chunkSize: 20 },
    ].map(workload => ({
      ...workload,
      iterations: readPositiveIntegerArgument(2, DEFAULT_SWEEP_ITERATIONS),
    }))
  : sweep
    ? [
        { chunkCount: 5_000, chunkSize: 200 },
        { chunkCount: 10_000, chunkSize: 200 },
        { chunkCount: 20_000, chunkSize: 200 },
        { chunkCount: 40_000, chunkSize: 200 },
        { chunkCount: 10_000, chunkSize: 1_000 },
        { chunkCount: 20_000, chunkSize: 1_000 },
      ].map(workload => ({
        ...workload,
        iterations: readPositiveIntegerArgument(2, DEFAULT_SWEEP_ITERATIONS),
      }))
    : [
        {
          chunkCount: readPositiveIntegerArgument(2, DEFAULT_CHUNK_COUNT),
          chunkSize: readPositiveIntegerArgument(3, DEFAULT_CHUNK_SIZE),
          iterations: readPositiveIntegerArgument(4, DEFAULT_ITERATIONS),
        },
      ];

type BenchmarkResult = {
  elapsedMs: number;
  outputChunks: number;
  writeCalls: number;
  finalTextLength: number;
};

function readPositiveIntegerArgument(index: number, fallback: number) {
  const value = positionalArguments[index - 2];

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

function createBenchmarkStream({
  chunkCount,
  chunkSize,
}: {
  chunkCount: number;
  chunkSize: number;
}) {
  const textDelta = 'x'.repeat(chunkSize);

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

async function runBenchmark(workload: Workload): Promise<BenchmarkResult> {
  const state = createStreamingUIMessageState<UIMessage>({
    lastMessage: undefined,
    messageId: 'm1',
  });
  let writeCalls = 0;

  const startTime = performance.now();
  const processedStream = processUIMessageStream({
    stream: createBenchmarkStream(workload),
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
    times.length > 1
      ? times.reduce((sum, time) => sum + (time - average) ** 2, 0) /
        (times.length - 1)
      : 0;

  return {
    average,
    max: Math.max(...times),
    median,
    min: Math.min(...times),
    standardDeviation: Math.sqrt(variance),
  };
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function runWorkload(workload: Workload) {
  const totalTextLength = workload.chunkCount * workload.chunkSize;

  console.log('processUIMessageStream text delta benchmark');
  console.log(`  chunks: ${workload.chunkCount.toLocaleString()}`);
  console.log(`  chunk size: ${workload.chunkSize.toLocaleString()} chars`);
  console.log(`  total text: ${totalTextLength.toLocaleString()} chars`);
  console.log(`  total text: ${formatMegabytes(totalTextLength)}`);
  console.log(`  iterations: ${workload.iterations.toLocaleString()}`);
  console.log();

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < workload.iterations; i++) {
    const result = await runBenchmark(workload);
    results.push(result);

    if (!summaryOnly) {
      console.log(`Run ${i + 1}: ${result.elapsedMs.toFixed(0)} ms`);
    }
  }

  const stats = summarize(results.map(result => result.elapsedMs));
  const firstResult = results[0];
  const throughput = totalTextLength / (stats.median / 1000) / (1024 * 1024);

  console.log();
  console.log('--- Statistics ---');
  console.log(`Median: ${stats.median.toFixed(0)} ms`);
  console.log(`Average: ${stats.average.toFixed(3)} ms`);
  console.log(`Std dev: ${stats.standardDeviation.toFixed(3)} ms`);
  console.log(`Min: ${stats.min.toFixed(0)} ms`);
  console.log(`Max: ${stats.max.toFixed(0)} ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} MB/s`);
  console.log();
  console.log('--- Validation ---');
  console.log(`Output chunks: ${firstResult.outputChunks.toLocaleString()}`);
  console.log(`Write calls: ${firstResult.writeCalls.toLocaleString()}`);
  console.log(
    `Final text length: ${firstResult.finalTextLength.toLocaleString()}`,
  );

  return {
    ...workload,
    totalTextLength,
    throughput,
    ...stats,
  };
}

const summaries = [];

for (const workload of workloads) {
  summaries.push(await runWorkload(workload));
  console.log();
}

if (sweep) {
  console.log('--- Sweep Summary ---');
  console.log(
    [
      'chunks',
      'chunkSize',
      'totalText',
      'medianMs',
      'averageMs',
      'stdDevMs',
      'throughputMBps',
    ].join('\t'),
  );

  for (const summary of summaries) {
    console.log(
      [
        summary.chunkCount,
        summary.chunkSize,
        formatMegabytes(summary.totalTextLength),
        summary.median.toFixed(1),
        summary.average.toFixed(3),
        summary.standardDeviation.toFixed(3),
        summary.throughput.toFixed(2),
      ].join('\t'),
    );
  }

  console.log();
}

console.log('Compare with main by running the same script in both worktrees:');
console.log(
  '  pnpm tsx packages/ai/scripts/process-ui-message-stream-benchmark.ts',
);

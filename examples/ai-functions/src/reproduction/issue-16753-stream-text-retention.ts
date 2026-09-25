import type {
  LanguageModelV3,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { streamText } from 'ai';

const deltaCount = 384;
const deltaSize = 256 * 1024;
const expectedTextBytes = deltaCount * deltaSize;
const childResultPrefix = 'ISSUE_16753_CHILD_RESULT ';
const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: deltaCount,
    text: deltaCount,
    reasoning: 0,
  },
};

function createLargeOutputStream(): ReadableStream<LanguageModelV3StreamPart> {
  let index = -1;

  return new ReadableStream({
    pull(controller) {
      if (index === -1) {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
      } else if (index < deltaCount) {
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: randomBytes(deltaSize).toString('latin1'),
        });
      } else if (index === deltaCount) {
        controller.enqueue({ type: 'text-end', id: 'text-1' });
      } else if (index === deltaCount + 1) {
        controller.enqueue({
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        });
      } else {
        controller.close();
      }

      index++;
    },
  });
}

function createModel(): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'issue-16753-reproduction',
    modelId: 'large-output-model',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('doGenerate is not used by this reproduction');
    },
    async doStream() {
      return { stream: createLargeOutputStream() };
    },
  };
}

async function consumeDirectProviderStream(): Promise<number> {
  const { stream } = await createModel().doStream({} as never);
  const reader = stream.getReader();
  let consumedBytes = 0;

  while (true) {
    const { done, value: part } = await reader.read();

    if (done) {
      break;
    }

    if (part.type === 'text-delta') {
      consumedBytes += part.delta.length;
    }
  }

  return consumedBytes;
}

async function consumeTextStream(): Promise<number> {
  const result = streamText({
    model: createModel(),
    prompt: 'Emit a very large response',
  });
  let consumedBytes = 0;

  for await (const delta of result.textStream) {
    consumedBytes += delta.length;
  }

  // Keep the result alive so its unread tee branch remains reachable.
  Object.assign(globalThis, { issue16753RetainedResult: result });

  return consumedBytes;
}

function emitChildResult(mode: string, consumedBytes: number) {
  const memory = process.memoryUsage();

  console.log(
    `${childResultPrefix}${JSON.stringify({
      mode,
      consumedBytes,
      heapUsed: memory.heapUsed,
      external: memory.external,
      rss: memory.rss,
    })}`,
  );
}

function parseChildResult(stdout: string) {
  const line = stdout
    .split('\n')
    .find(candidate => candidate.startsWith(childResultPrefix));

  if (line == null) {
    return undefined;
  }

  return JSON.parse(line.slice(childResultPrefix.length)) as {
    mode: string;
    consumedBytes: number;
    heapUsed: number;
    external: number;
    rss: number;
  };
}

function runChild(mode: 'direct' | 'sdk') {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=80',
      '--expose-gc',
      '--import',
      'tsx',
      scriptPath,
      `--child=${mode}`,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    },
  );

  return {
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    metrics: parseChildResult(result.stdout),
  };
}

async function runChildMode(mode: string) {
  const consumedBytes =
    mode === 'direct'
      ? await consumeDirectProviderStream()
      : await consumeTextStream();

  globalThis.gc?.();
  emitChildResult(mode, consumedBytes);
}

async function main() {
  const childMode = process.argv
    .find(argument => argument.startsWith('--child='))
    ?.slice('--child='.length);

  if (childMode != null) {
    await runChildMode(childMode);
    return;
  }

  const direct = runChild('direct');

  if (
    direct.exitCode !== 0 ||
    direct.metrics?.consumedBytes !== expectedTextBytes
  ) {
    throw new Error(
      `Reproduction harness failed: direct provider stream did not consume ${expectedTextBytes} bytes (exit=${direct.exitCode}, signal=${direct.signal}, stderr=${direct.stderr.slice(-500)})`,
    );
  }

  const sdk = runChild('sdk');
  const sdkReachedHeapLimit =
    sdk.signal === 'SIGABRT' &&
    sdk.stderr.includes(
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
    );

  if (sdkReachedHeapLimit) {
    throw new Error(
      'Reproduced issue #16753: streamText().textStream retained a large streaming output until the memory-limited process failed',
    );
  }

  if (sdk.exitCode !== 0) {
    throw new Error(
      `Reproduction harness failed: streamText child failed without reaching the heap limit (exit=${sdk.exitCode}, signal=${sdk.signal}, stderr=${sdk.stderr.slice(-500)})`,
    );
  }

  if (sdk.metrics?.consumedBytes !== expectedTextBytes) {
    throw new Error(
      `Reproduction harness failed: streamText consumed ${sdk.metrics?.consumedBytes ?? 'no reported'} bytes instead of ${expectedTextBytes}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        expectedTextBytes,
        direct: direct.metrics,
        sdk: sdk.metrics,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const heapLimitMiB = 80;
const outputMiB = 96;
const chunkBytes = 1024 * 1024;
const outputBytes = outputMiB * chunkBytes;
const childMode = process.env.ISSUE_16753_MODE;

function createLongOutputStream() {
  let chunkIndex = -2;

  return new ReadableStream<LanguageModelV4StreamPart>({
    pull(controller) {
      if (chunkIndex === -2) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
      } else if (chunkIndex === -1) {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
      } else if (chunkIndex < outputMiB) {
        const prefix = `${chunkIndex.toString().padStart(6, '0')}:`;
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: prefix + 'x'.repeat(chunkBytes - prefix.length),
        });
      } else if (chunkIndex === outputMiB) {
        controller.enqueue({ type: 'text-end', id: 'text-1' });
      } else if (chunkIndex === outputMiB + 1) {
        controller.enqueue({
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: outputMiB,
              text: outputMiB,
              reasoning: 0,
            },
          },
        });
      } else {
        controller.close();
      }

      chunkIndex++;
    },
  });
}

function createModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: createLongOutputStream() }),
  });
}

async function consumeDirectProviderStream() {
  const model = createModel();
  const { stream } = await model.doStream({} as LanguageModelV4CallOptions);
  let bytes = 0;

  for await (const part of stream) {
    if (part.type === 'text-delta') {
      bytes += Buffer.byteLength(part.delta);
    }
  }

  assert.equal(bytes, outputBytes);
  console.log(`DIRECT_OK bytes=${bytes}`);
}

async function consumeStreamTextTextStream() {
  const options = {
    model: createModel(),
    prompt: 'Emit a very large response.',
    // The issue discussion proposes this non-breaking opt-in. It is currently
    // ignored because main has no supported low-retention stream mode.
    experimental_streamMode: 'single-consumer',
  } as const;
  const result = streamText(options);
  let bytes = 0;

  for await (const delta of result.textStream) {
    bytes += Buffer.byteLength(delta);
  }

  assert.equal(bytes, outputBytes);
  console.log(`SDK_OK bytes=${bytes}`);
}

function runConstrainedChild(mode: 'direct' | 'sdk') {
  return spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${heapLimitMiB}`,
      '--import',
      'tsx',
      fileURLToPath(import.meta.url),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ISSUE_16753_MODE: mode },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

function childOutput(result: ReturnType<typeof runConstrainedChild>) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

async function main() {
  if (childMode === 'direct') {
    await consumeDirectProviderStream();
    return;
  }

  if (childMode === 'sdk') {
    await consumeStreamTextTextStream();
    return;
  }

  const direct = runConstrainedChild('direct');
  assert.equal(
    direct.status,
    0,
    `Direct provider control failed:\n${childOutput(direct)}`,
  );
  assert.match(
    childOutput(direct),
    new RegExp(`DIRECT_OK bytes=${outputBytes}`),
  );

  const sdk = runConstrainedChild('sdk');
  const sdkOutput = childOutput(sdk);

  if (sdk.status === 0) {
    assert.match(sdkOutput, new RegExp(`SDK_OK bytes=${outputBytes}`));
    console.log(
      'Issue #16753 was not reproduced: streamText textStream completed under the same constrained heap as direct provider streaming.',
    );
    return;
  }

  const exhaustedHeap =
    /heap out of memory/i.test(sdkOutput) ||
    /reached heap limit/i.test(sdkOutput) ||
    /ineffective mark-compacts/i.test(sdkOutput);

  assert.ok(
    exhaustedHeap,
    `streamText child failed for an unrelated reason (status=${sdk.status}, signal=${sdk.signal}):\n${sdkOutput}`,
  );

  console.error(
    'ISSUE_16753_REPRODUCED: streamText textStream exhausted the constrained heap while direct provider streaming completed',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});

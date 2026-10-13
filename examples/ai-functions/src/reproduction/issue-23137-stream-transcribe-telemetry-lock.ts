import assert from 'node:assert/strict';
import type { TranscriptionModelV4 } from '@ai-sdk/provider';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';

const model: TranscriptionModelV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  async doGenerate() {
    throw new Error('Not used by this reproduction.');
  },
  async doStream({ audio }) {
    const reader = audio.getReader();
    try {
      while (!(await reader.read()).done) {
        // Drain the finite caller-provided audio stream.
      }
    } finally {
      reader.releaseLock();
    }

    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'finish',
            text: 'hello',
            segments: [],
          });
          controller.close();
        },
      }),
    };
  },
};

async function check(enableTelemetry: boolean) {
  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.close();
    },
  });
  let byteLength: number | undefined;

  const result = streamTranscribe({
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    model,
    telemetry: enableTelemetry
      ? {
          integrations: [
            {
              experimental_onStreamTranscriptionEnd(event) {
                byteLength = event.audio.byteLength;
              },
            },
          ],
        }
      : undefined,
  });

  const text = await result.text;
  await new Promise(resolve => setTimeout(resolve, 0));

  return { text, locked: audio.locked, byteLength };
}

async function main() {
  const control = await check(false);
  const observed = await check(true);

  console.log({ control, observed });
  assert.equal(control.text, 'hello');
  assert.equal(observed.text, 'hello');
  assert.equal(control.locked, false);
  assert.equal(observed.byteLength, 2);
  assert.equal(
    observed.locked,
    false,
    'ISSUE #23137: telemetry must release the caller audio stream lock after completion',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

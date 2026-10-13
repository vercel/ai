import assert from 'node:assert/strict';
import {
  createElevenLabs,
  type ElevenLabsProviderSettings,
} from '@ai-sdk/elevenlabs';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { run } from '../../lib/run';

class SyntheticElevenLabsWebSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
      this.emit({
        message_type: 'session_started',
        session_id: 'synthetic',
      });
    });
  }

  send(data: string) {
    if (!data.includes('"commit":true')) return;

    queueMicrotask(() => {
      this.emit({
        message_type: 'committed_transcript',
        text: 'Hello from the AI SDK.',
      });
      this.emit({
        message_type: 'committed_transcript_with_timestamps',
        text: 'Hello from the AI SDK.',
        words: [
          {
            text: 'Hello from the AI SDK.',
            start: 1,
            end: 2.5,
            type: 'word',
          },
        ],
      });
    });
  }

  close() {
    this.readyState = 3;
  }

  private emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

const elevenLabs = createElevenLabs({
  apiKey: 'synthetic',
  webSocket:
    SyntheticElevenLabsWebSocket as unknown as ElevenLabsProviderSettings['webSocket'],
});

run(async () => {
  const result = streamTranscribe({
    model: elevenLabs.transcription('scribe_v2_realtime'),
    audio: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0, 0]));
        controller.close();
      },
    }),
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      elevenlabs: {
        streaming: { includeTimestamps: true },
      },
    },
  });

  const finals = [];
  for await (const part of result.fullStream) {
    if (part.type === 'transcript-final') {
      finals.push(part);
      console.log(`${part.startSecond}s-${part.endSecond}s: ${part.text}`);
    }
  }

  assert.deepEqual(finals, [
    {
      type: 'transcript-final',
      id: 'synthetic:0',
      text: 'Hello from the AI SDK.',
      startSecond: 1,
      endSecond: 2.5,
    },
  ]);
  assert.equal(await result.text, 'Hello from the AI SDK.');
});

import assert from 'node:assert/strict';
import { experimental_resampleAudio as resampleAudio } from 'ai';
import { BrowserRealtimeAudio } from '../../../../packages/ai/src/realtime/browser-realtime-audio';

class FakeScriptProcessor {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;

  connect(): void {}

  disconnect(): void {}
}

class FakeAudioContext {
  static latestProcessor: FakeScriptProcessor | undefined;

  readonly sampleRate = 44_100;
  readonly destination = {};

  createMediaStreamSource(): MediaStreamAudioSourceNode {
    return {
      connect() {},
      disconnect() {},
    } as unknown as MediaStreamAudioSourceNode;
  }

  createScriptProcessor(): ScriptProcessorNode {
    const processor = new FakeScriptProcessor();
    FakeAudioContext.latestProcessor = processor;
    return processor as unknown as ScriptProcessorNode;
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

async function main(): Promise<void> {
  const inputRate = 44_100;
  const outputRate = 24_000;
  const chunkSize = 1_024;
  const chunkCount = 1_000;
  const audio = new Float32Array(chunkSize * chunkCount);

  for (let index = 0; index < audio.length; index++) {
    audio[index] = Math.sin((2 * Math.PI * 440 * index) / inputRate);
  }

  const wholeLength = resampleAudio(audio, inputRate, outputRate).length;
  let capturedLength = 0;

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });

  const track = {
    enabled: true,
    muted: false,
    readyState: 'live',
    addEventListener() {},
    removeEventListener() {},
    stop() {},
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;

  const capture = new BrowserRealtimeAudio({
    captureSampleRate: outputRate,
    playbackSampleRate: outputRate,
    onAudio(base64Audio) {
      capturedLength += Buffer.from(base64Audio, 'base64').byteLength / 2;
    },
    onPlayingChange() {},
    onCapturingChange() {},
  });

  capture.startCapture(stream);
  const processor = FakeAudioContext.latestProcessor;
  assert.ok(processor?.onaudioprocess, 'Capture processor was not initialized');

  for (let offset = 0; offset < audio.length; offset += chunkSize) {
    const chunk = audio.subarray(offset, offset + chunkSize);
    processor.onaudioprocess({
      inputBuffer: {
        getChannelData: () => chunk,
      },
    } as unknown as AudioProcessingEvent);
  }
  capture.stopCapture();

  const driftSamples = wholeLength - capturedLength;
  console.log({
    wholeLength,
    capturedLength,
    driftSamples,
    durationDifferenceMs: (driftSamples / outputRate) * 1_000,
  });

  assert.ok(
    Math.abs(driftSamples) <= 1,
    `Realtime capture resampling accumulated ${driftSamples} samples of chunk-boundary drift; expected at most 1 sample`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

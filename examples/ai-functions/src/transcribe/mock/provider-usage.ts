import assert from 'node:assert/strict';
import { generateSpeech, transcribe } from 'ai';
import { MockSpeechModelV4, MockTranscriptionModelV4 } from 'ai/test';
import { run } from '../../lib/run';

const wavAudio = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
]);

run(async () => {
  const transcriptionUsage = {
    inputTokens: 12,
    details: { audioTokens: 8, textTokens: 4 },
  };
  const speechUsage = {
    characters: 24,
    details: { billableCharacters: 24 },
  };

  const transcription = await transcribe({
    model: new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: 'Hello from the AI SDK!',
        segments: [],
        language: 'en',
        durationInSeconds: 1,
        usage: transcriptionUsage,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: 'mock-transcription-model',
        },
      }),
    }),
    audio: wavAudio,
  });

  const speech = await generateSpeech({
    model: new MockSpeechModelV4({
      doGenerate: async () => ({
        audio: wavAudio,
        usage: speechUsage,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: 'mock-speech-model',
        },
      }),
    }),
    text: transcription.text,
  });

  assert.strictEqual(transcription.usage, transcriptionUsage);
  assert.strictEqual(speech.usage, speechUsage);

  console.log({
    transcriptionUsage: transcription.usage,
    speechUsage: speech.usage,
  });
});

import type { TranscriptionModelV4 } from '@ai-sdk/provider';
import { expectTypeOf } from 'vitest';
import {
  mistral,
  type MistralTranscriptionModelId,
  type MistralTranscriptionModelOptions,
} from '.';

expectTypeOf(
  mistral.transcription('voxtral-mini-latest'),
).toEqualTypeOf<TranscriptionModelV4>();
expectTypeOf(
  mistral.transcriptionModel('voxtral-mini-latest'),
).toEqualTypeOf<TranscriptionModelV4>();

const customModelId =
  'custom-voxtral-model' satisfies MistralTranscriptionModelId;
expectTypeOf(
  mistral.transcription(customModelId),
).toEqualTypeOf<TranscriptionModelV4>();

const options = {
  language: 'en',
  returnLanguage: false,
  temperature: 0.2,
  diarize: true,
  contextBias: ['Vercel', 'AI_SDK'],
} satisfies MistralTranscriptionModelOptions;
expectTypeOf(options).toMatchTypeOf<MistralTranscriptionModelOptions>();

const timestampOptions = {
  timestampGranularities: ['segment', 'word'],
} satisfies MistralTranscriptionModelOptions;
expectTypeOf(
  timestampOptions,
).toMatchTypeOf<MistralTranscriptionModelOptions>();

const invalidOptions: MistralTranscriptionModelOptions = {
  // @ts-expect-error timestamp granularities are restricted to segment and word
  timestampGranularities: ['sentence'],
};
invalidOptions;

const realtimeOptions = {
  targetStreamingDelayMs: 480,
  diarize: true,
  speakerReferences: { Jane: 'base64-audio' },
  turnDetection: {
    startThreshold: 0.5,
    eagerEndThreshold: 0.4,
    endThreshold: 0.3,
    minSilenceMs: 300,
    endTimeoutMs: 2500,
  },
} satisfies MistralTranscriptionModelOptions;
expectTypeOf(realtimeOptions).toMatchTypeOf<MistralTranscriptionModelOptions>();
expectTypeOf(
  mistral.transcription('voxtral-mini-transcribe-realtime-3').doStream,
).toEqualTypeOf<TranscriptionModelV4['doStream']>();

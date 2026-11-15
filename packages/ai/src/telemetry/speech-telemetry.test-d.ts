import { expectTypeOf } from 'vitest';
import type { JSONObject } from '@ai-sdk/provider';
import type { EmbedStartEvent } from '../embed/embed-events';
import type { GenerateObjectStartEvent } from '../generate-object/structured-output-events';
import type { GenerateTextStartEvent } from '../generate-text/generate-text-events';
import type { RerankStartEvent } from '../rerank/rerank-events';
import type {
  experimental_streamTranscribe,
  generateSpeech,
  transcribe,
  GenerateSpeechEndEvent,
  GenerateSpeechStartEvent,
  TelemetryOptions,
  TranscriptionEndEvent,
  TranscriptionStartEvent,
  Experimental_StreamTranscriptionEndEvent,
  Experimental_StreamTranscriptionStartEvent,
  Telemetry,
} from '..';

expectTypeOf<Parameters<typeof generateSpeech>[0]['telemetry']>().toEqualTypeOf<
  TelemetryOptions | undefined
>();
expectTypeOf<Parameters<typeof transcribe>[0]['telemetry']>().toEqualTypeOf<
  TelemetryOptions | undefined
>();
expectTypeOf<
  Parameters<typeof experimental_streamTranscribe>[0]['telemetry']
>().toEqualTypeOf<TelemetryOptions | undefined>();

expectTypeOf<GenerateSpeechStartEvent['text']>().toEqualTypeOf<string>();
expectTypeOf<GenerateSpeechEndEvent['audio']>().toEqualTypeOf<{
  readonly byteLength: number;
  readonly mediaType: string;
  readonly format: string;
}>();
expectTypeOf<TranscriptionStartEvent['audio']['byteLength']>().toEqualTypeOf<
  number | undefined
>();
expectTypeOf<TranscriptionStartEvent['audio']['mediaType']>().toEqualTypeOf<
  string | undefined
>();
expectTypeOf<TranscriptionEndEvent['text']>().toEqualTypeOf<string>();
expectTypeOf<TranscriptionEndEvent['usage']>().toEqualTypeOf<
  JSONObject | undefined
>();
expectTypeOf<
  Experimental_StreamTranscriptionStartEvent['operationId']
>().toEqualTypeOf<'ai.streamTranscribe'>();
expectTypeOf<
  Experimental_StreamTranscriptionEndEvent['operationId']
>().toEqualTypeOf<'ai.streamTranscribe'>();

const legacyOnStart: NonNullable<Telemetry['onStart']> = (
  _event:
    | GenerateTextStartEvent
    | GenerateObjectStartEvent
    | EmbedStartEvent
    | RerankStartEvent,
) => {};
expectTypeOf(legacyOnStart).toMatchTypeOf<NonNullable<Telemetry['onStart']>>();

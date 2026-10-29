import { expectTypeOf } from 'vitest';
import type {
  generateImage,
  GenerateImageEndEvent,
  GenerateImageInputFile,
  GenerateImageOutputFile,
  GenerateImageStartEvent,
  ImageModelCallEndEvent,
  ImageModelCallErrorEvent,
  ImageModelCallStartEvent,
  InferTelemetryEvent,
  Telemetry,
  TelemetryOptions,
} from '..';

expectTypeOf<Parameters<typeof generateImage>[0]['telemetry']>().toEqualTypeOf<
  TelemetryOptions | undefined
>();

expectTypeOf<
  GenerateImageStartEvent['operationId']
>().toEqualTypeOf<'ai.generateImage'>();
expectTypeOf<GenerateImageStartEvent['prompt']>().toEqualTypeOf<
  string | undefined
>();
expectTypeOf<GenerateImageStartEvent['images']>().toEqualTypeOf<
  Array<GenerateImageInputFile> | undefined
>();
expectTypeOf<GenerateImageEndEvent['images']>().toEqualTypeOf<
  Array<GenerateImageOutputFile>
>();
expectTypeOf<GenerateImageOutputFile>().toEqualTypeOf<{
  readonly mediaType: string;
  readonly byteLength: number;
}>();
expectTypeOf<
  ImageModelCallStartEvent['operationId']
>().toEqualTypeOf<'ai.generateImage.doGenerate'>();
expectTypeOf<ImageModelCallEndEvent['images']>().toEqualTypeOf<
  Array<GenerateImageOutputFile>
>();
expectTypeOf<ImageModelCallErrorEvent['error']>().toEqualTypeOf<unknown>();

expectTypeOf<InferTelemetryEvent<GenerateImageStartEvent>>().toMatchTypeOf<
  Parameters<NonNullable<Telemetry['onStart']>>[0]
>();
expectTypeOf<InferTelemetryEvent<GenerateImageEndEvent>>().toMatchTypeOf<
  Parameters<NonNullable<Telemetry['onEnd']>>[0]
>();

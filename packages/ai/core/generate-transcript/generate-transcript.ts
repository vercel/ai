import { TranscriptionModelV1, JSONValue } from '@ai-sdk/provider';
import { NoTranscriptGeneratedError } from '../../errors/no-transcript-generated-error';
import { prepareRetries } from '../prompt/prepare-retries';
import { TranscriptionWarning } from '../types/transcription-model';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import { TranscriptionResult } from './generate-transcript-result';
import {
  audioMimeTypeSignatures,
  detectMimeType,
} from '../util/detect-mimetype';
import { DataContent } from '../prompt';
import { convertDataContentToUint8Array } from '../prompt/data-content';

/**
Generates transcripts using a transcript model.

@param model - The transcript model to use.
@param audio - The audio data to transcribe as DataContent (string | Uint8Array<ArrayBufferLike> | ArrayBuffer | Buffer<ArrayBufferLike>).
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the generated transcript.
 */
export async function transcribe({
  model,
  audio,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The transcript model to use.
     */
  model: TranscriptionModelV1;

  /**
The audio data to transcribe.
   */
  audio: DataContent | URL;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "openai": {
    "temperature": 0
  }
}
```
     */
  providerOptions?: Record<string, Record<string, JSONValue>>;

  /**
Maximum number of retries per transcript model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;

  /**
Additional headers to include in the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string>;
}): Promise<TranscriptionResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });
  let audioData: Uint8Array;

  if (audio instanceof URL) {
    const arrayBuffer = await fetch(audio).then(res => res.arrayBuffer());
    audioData = new Uint8Array(arrayBuffer);
  } else {
    audioData = convertDataContentToUint8Array(audio);
  }

  const result = await retry(() =>
    model.doGenerate({
      audio: audioData,
      abortSignal,
      headers,
      providerOptions: providerOptions ?? {},
    }),
  );

  if (!result.text) {
    throw new NoTranscriptGeneratedError({ responses: [result.response] });
  }

  return new DefaultTranscriptionResult({
    text: result.text,
    segments: result.segments,
    language: result.language,
    durationInSeconds: result.durationInSeconds,
    warnings: result.warnings,
    responses: [result.response],
    providerMetadata: result.providerMetadata,
  });
}

class DefaultTranscriptionResult implements TranscriptionResult {
  readonly text: string;
  readonly segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  readonly language: string | undefined;
  readonly durationInSeconds: number | undefined;
  readonly warnings: Array<TranscriptionWarning>;
  readonly responses: Array<TranscriptionModelResponseMetadata>;
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;

  constructor(options: {
    text: string;
    segments: Array<{
      text: string;
      startSecond: number;
      endSecond: number;
    }>;
    language: string | undefined;
    durationInSeconds: number | undefined;
    warnings: Array<TranscriptionWarning>;
    responses: Array<TranscriptionModelResponseMetadata>;
    providerMetadata: Record<string, Record<string, JSONValue>>;
  }) {
    this.text = options.text;
    this.segments = options.segments;
    this.language = options.language;
    this.durationInSeconds = options.durationInSeconds;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata;
  }
}

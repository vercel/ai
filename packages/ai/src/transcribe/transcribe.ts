import { JSONValue, TranscriptionModelV2 } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { NoTranscriptGeneratedError } from '../error/no-transcript-generated-error';
import {
  audioMediaTypeSignatures,
  detectMediaType,
} from '../util/detect-media-type';
import { download } from '../util/download';
import { prepareRetries } from '../util/prepare-retries';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { DataContent } from '../prompt';
import { convertDataContentToUint8Array } from '../prompt/data-content';
import { TranscriptionWarning } from '../types/transcription-model';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import { TranscriptionResult } from './transcribe-result';

/**
Generates transcripts using a transcription model.

@param model - The transcription model to use.
@param audio - The audio data to transcribe as DataContent (string | Uint8Array | ArrayBuffer | Buffer) or a URL.
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
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The transcription model to use.
     */
  model: TranscriptionModelV2;

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
  providerOptions?: ProviderOptions;

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
  if (model.specificationVersion !== 'v2') {
    throw new UnsupportedModelVersionError({
      version: model.specificationVersion,
      provider: model.provider,
      modelId: model.modelId,
    });
  }

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const audioData =
    audio instanceof URL
      ? (await download({ url: audio })).data
      : convertDataContentToUint8Array(audio);

  const result = await retry(() =>
    model.doGenerate({
      audio: audioData,
      abortSignal,
      headers,
      providerOptions,
      mediaType:
        detectMediaType({
          data: audioData,
          signatures: audioMediaTypeSignatures,
        }) ?? 'audio/wav',
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
    providerMetadata: Record<string, Record<string, JSONValue>> | undefined;
  }) {
    this.text = options.text;
    this.segments = options.segments;
    this.language = options.language;
    this.durationInSeconds = options.durationInSeconds;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}

import { TranscriptionModelV1, JSONValue } from '@ai-sdk/provider';
import { NoTranscriptGeneratedError } from '../../errors/no-transcript-generated-error';
import { prepareRetries } from '../prompt/prepare-retries';
import { TranscriptionWarning } from '../types/transcription-model';
import { TranscriptionModelResponseMetadata } from '../types/transcription-model-response-metadata';
import { GenerateTranscriptResult } from './generate-transcript-result';
import { GeneratedTranscript } from './';

/**
Generates transcripts using a transcript model.

@param model - The transcript model to use.
@param audio - The audio data to transcribe.
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the generated transcript.
 */
export async function generateTranscript({
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
  audio: Uint8Array;

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
}): Promise<GenerateTranscriptResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const result = await retry(() =>
    model.doGenerate({
      audio,
      abortSignal,
      headers,
      providerOptions: providerOptions ?? {},
    }),
  );

  if (!result.transcript.text) {
    throw new NoTranscriptGeneratedError({ responses: [result.response] });
  }

  return new DefaultGenerateTranscriptResult({
    transcript: result.transcript,
    warnings: result.warnings,
    responses: [result.response],
  });
}

class DefaultGenerateTranscriptResult implements GenerateTranscriptResult {
  readonly transcript: GeneratedTranscript;
  readonly warnings: Array<TranscriptionWarning>;
  readonly responses: Array<TranscriptionModelResponseMetadata>;

  constructor(options: {
    transcript: GeneratedTranscript;
    warnings: Array<TranscriptionWarning>;
    responses: Array<TranscriptionModelResponseMetadata>;
  }) {
    this.transcript = options.transcript;
    this.warnings = options.warnings;
    this.responses = options.responses;
  }
}

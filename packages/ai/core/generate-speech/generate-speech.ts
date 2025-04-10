import { JSONValue, SpeechModelV1 } from '@ai-sdk/provider';
import { NoSpeechGeneratedError } from '../../errors/no-speech-generated-error';
import { prepareRetries } from '../prompt/prepare-retries';
import { ProviderOptions } from '../types/provider-metadata';
import { SpeechWarning } from '../types/speech-model';
import { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import { SpeechResult } from './generate-speech-result';

/**
Generates speech audio using a speech model.

@param model - The speech model to use.
@param text - The text to convert to speech.
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the generated audio data.
 */
export async function generateSpeech({
  model,
  text,
  voice,
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The speech model to use.
     */
  model: SpeechModelV1;

  /**
The text to convert to speech.
   */
  text: string;

  /**
The voice to use for speech generation.
   */
  voice?: string;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "openai": {
    "voice": "alloy"
  }
}
```
     */
  providerOptions?: ProviderOptions;

  /**
Maximum number of retries per speech model call. Set to 0 to disable retries.

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
}): Promise<SpeechResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const result = await retry(() =>
    model.doGenerate({
      text,
      voice,
      abortSignal,
      headers,
      providerOptions,
    }),
  );

  if (!result.audioData) {
    throw new NoSpeechGeneratedError({ responses: [result.response] });
  }

  return new DefaultSpeechResult({
    audioData: result.audioData,
    contentType: result.contentType,
    warnings: result.warnings,
    responses: [result.response],
    providerMetadata: result.providerMetadata,
  });
}

class DefaultSpeechResult implements SpeechResult {
  readonly audioData: ArrayBuffer;
  readonly contentType: string;
  readonly warnings: Array<SpeechWarning>;
  readonly responses: Array<SpeechModelResponseMetadata>;
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;

  constructor(options: {
    audioData: ArrayBuffer;
    contentType: string;
    warnings: Array<SpeechWarning>;
    responses: Array<SpeechModelResponseMetadata>;
    providerMetadata: Record<string, Record<string, JSONValue>> | undefined;
  }) {
    this.audioData = options.audioData;
    this.contentType = options.contentType;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}

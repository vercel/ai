import { JSONValue, IsolationModelV1 } from '@ai-sdk/provider';
import { NoIsolatedAudioError } from '../../errors/no-isolated-audio-error';
import { download } from '../../util/download';
import { DataContent } from '../prompt';
import { convertDataContentToUint8Array } from '../prompt/data-content';
import { prepareRetries } from '../prompt/prepare-retries';
import { ProviderOptions } from '../types/provider-metadata';
import { IsolationWarning } from '../types/isolation-model';
import { IsolationModelResponseMetadata } from '../types/isolation-model-response-metadata';
import {
  audioMimeTypeSignatures,
  detectMimeType,
} from '../util/detect-mimetype';
import { IsolationResult } from './isolate-audio-result';
import { GeneratedAudioFile } from '../generate-speech';

/**
Isolates audio using an isolation model.

@param model - The isolation model to use.
@param audio - The audio data to isolate as DataContent (string | Uint8Array | ArrayBuffer | Buffer) or a URL.
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the isolated audio.
 */
export async function isolateAudio({
  model,
  audio,
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The isolation model to use.
     */
  model: IsolationModelV1;

  /**
The audio data to isolate.
   */
  audio: DataContent | URL;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "elevenlabs": {}
}
```
     */
  providerOptions?: ProviderOptions;

  /**
Maximum number of retries per isolation model call. Set to 0 to disable retries.

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
}): Promise<IsolationResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });
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
        detectMimeType({
          data: audioData,
          signatures: audioMimeTypeSignatures,
        }) ?? 'audio/wav',
    }),
  );

  if (!result.audio) {
    throw new NoIsolatedAudioError({ responses: [result.response] });
  }

  return new DefaultIsolationResult({
    audio: result.audio,
    warnings: result.warnings,
    responses: [result.response],
    providerMetadata: result.providerMetadata,
  });
}

class DefaultIsolationResult implements IsolationResult {
  readonly audio: GeneratedAudioFile;
  readonly warnings: Array<IsolationWarning>;
  readonly responses: Array<IsolationModelResponseMetadata>;
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;

  constructor(options: {
    audio: GeneratedAudioFile;
    warnings: Array<IsolationWarning>;
    responses: Array<IsolationModelResponseMetadata>;
    providerMetadata: Record<string, Record<string, JSONValue>> | undefined;
  }) {
    this.audio = options.audio;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}

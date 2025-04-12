import { JSONValue, VoiceChangerModelV1 } from '@ai-sdk/provider';
import { NoSpeechGeneratedError } from '../../errors/no-speech-generated-error';
import { download } from '../../util/download';
import { DataContent } from '../prompt';
import { convertDataContentToUint8Array } from '../prompt/data-content';
import { prepareRetries } from '../prompt/prepare-retries';
import { ProviderOptions } from '../types/provider-metadata';
import {
  audioMimeTypeSignatures,
  detectMimeType,
} from '../util/detect-mimetype';
import { ChangeVoiceResult } from './change-voice-result';
import {
  DefaultGeneratedAudioFile,
  GeneratedAudioFile,
} from '../generate-speech/generated-audio-file';

/**
Changes the voice of an audio file using a voice changer model.

@param model - The voice changer model to use.
@param audio - The audio data to change the voice of as DataContent (string | Uint8Array | ArrayBuffer | Buffer) or a URL.
@param voice - The voice to use for the speech.
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the generated audio.
 */
export async function changeVoice({
  model,
  audio,
  voice,
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The voice changer model to use.
     */
  model: VoiceChangerModelV1;

  /**
The audio data to change the voice of.
   */
  audio: DataContent | URL;

  /**
The voice to use for the speech.
   */
  voice: string;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "elevenlabs": {
    "enable_logging": false
  }
}
```
     */
  providerOptions?: ProviderOptions;

  /**
Maximum number of retries per voice changer model call. Set to 0 to disable retries.

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
}): Promise<ChangeVoiceResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });
  const audioData =
    audio instanceof URL
      ? (await download({ url: audio })).data
      : convertDataContentToUint8Array(audio);

  const result = await retry(() =>
    model.doGenerate({
      audio: audioData,
      voice,
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

  if (!result.audio || result.audio.length === 0) {
    throw new NoSpeechGeneratedError({ responses: [result.response] });
  }

  return new DefaultChangeVoiceResult({
    audio: new DefaultGeneratedAudioFile({
      data: result.audio,
      mimeType:
        detectMimeType({
          data: result.audio,
          signatures: audioMimeTypeSignatures,
        }) ?? 'audio/wav',
    }),
    warnings: result.warnings,
    responses: [result.response],
    providerMetadata: result.providerMetadata,
  });
}

class DefaultChangeVoiceResult implements ChangeVoiceResult {
  readonly audio: GeneratedAudioFile;
  readonly warnings: Array<VoiceChangerWarning>;
  readonly responses: Array<VoiceChangerModelResponseMetadata>;
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;

  constructor(options: {
    audio: GeneratedAudioFile;
    warnings: Array<VoiceChangerWarning>;
    responses: Array<VoiceChangerModelResponseMetadata>;
    providerMetadata: Record<string, Record<string, JSONValue>> | undefined;
  }) {
    this.audio = options.audio;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}

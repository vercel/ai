import { JSONValue } from '@ai-sdk/provider';
import { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import { SpeechWarning } from '../types';

/**
The result of a `generateSpeech` call.
It contains the audio data and additional information.
 */
export interface SpeechResult {
  /**
   * The audio data as a base64 encoded string or binary data.
   */
  readonly audio: string | Uint8Array;

  /**
  The IANA media type of the audio data.

  @see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  readonly mediaType: string;

  /**
  Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<SpeechWarning>;

  /**
  Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<SpeechModelResponseMetadata>;

  /**
  Provider metadata from the provider.
   */
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;
}

import { JSONValue } from '@ai-sdk/provider';
import { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';

/**
The result of a `speak` call.
It contains the audio data and additional information.
 */
export interface SpeechResult {
  /**
   * The audio data as a binary buffer.
   */
  readonly audioData: ArrayBuffer;

  /**
   * The content type of the audio data (e.g., 'audio/mp3', 'audio/wav').
   */
  readonly contentType: string;

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

/**
 * Warning information from the speech generation process.
 */
export interface SpeechWarning {
  /**
   * The type of warning.
   */
  readonly type: string;

  /**
   * A human-readable message describing the warning.
   */
  readonly message: string;
}

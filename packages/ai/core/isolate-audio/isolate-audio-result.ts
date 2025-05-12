import { JSONValue } from '@ai-sdk/provider';
import { IsolationWarning } from '../types/isolation-model';
import { IsolationModelResponseMetadata } from '../types/isolation-model-response-metadata';
import { GeneratedAudioFile } from '../generate-speech';

/**
The result of a `isolateAudio` call.
It contains the isolated audio and additional information.
 */
export interface IsolationResult {
  /**
   * The isolated audio.
   */
  readonly audio: GeneratedAudioFile;

  /**
  Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<IsolationWarning>;

  /**
  Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<IsolationModelResponseMetadata>;

  /**
  Provider metadata from the provider.
   */
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;
}

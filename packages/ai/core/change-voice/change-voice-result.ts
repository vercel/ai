import { JSONValue } from '@ai-sdk/provider';
import { VoiceChangerWarning } from '../types/voice-changer-model';
import { VoiceChangerModelResponseMetadata } from '../types/voice-changer-model-response-metadata';
import { GeneratedAudioFile } from '../generate-speech';

/**
The result of a `transcribe` call.
It contains the transcript and additional information.
 */
export interface ChangeVoiceResult {
  /**
   * The complete transcribed text from the audio.
   */
  readonly audio: GeneratedAudioFile;

  /**
  Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<VoiceChangerWarning>;

  /**
  Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<VoiceChangerModelResponseMetadata>;

  /**
  Provider metadata from the provider.
   */
  readonly providerMetadata: Record<string, Record<string, JSONValue>>;
}

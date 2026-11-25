import type {
  Experimental_StreamingSpeechModelV4,
  SpeechModelV4,
} from '@ai-sdk/provider';

/**
 * Whether a resolved speech model implements the experimental streaming
 * speech extension (`Experimental_StreamingSpeechModelV4`).
 */
export function isStreamingSpeechModel(
  model: SpeechModelV4,
): model is Experimental_StreamingSpeechModelV4 {
  return (
    typeof (model as Partial<Experimental_StreamingSpeechModelV4>).doStream ===
    'function'
  );
}

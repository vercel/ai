import type { SpeechResult } from './generate-speech-result';
import { generateSpeech } from './generate-speech';

export { generateSpeech } from './generate-speech';
export { streamSpeech as experimental_streamSpeech } from './stream-speech';
export type {
  SpeechStreamPart,
  StreamSpeechResult,
} from './stream-speech-result';
export type { SpeechResult } from './generate-speech-result';
export type { GeneratedAudioFile } from './generated-audio-file';

// deprecated exports

/**
 * @deprecated Use `generateSpeech` instead.
 */
const experimental_generateSpeech = generateSpeech;
export { experimental_generateSpeech };

/**
 * @deprecated Use `SpeechResult` instead.
 */
type Experimental_SpeechResult = SpeechResult;
export type { Experimental_SpeechResult };

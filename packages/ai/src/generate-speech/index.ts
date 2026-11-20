import type { SpeechResult } from './generate-speech-result';
import { generateSpeech } from './generate-speech';
import { logWarnings } from '../logger/log-warnings';

export { generateSpeech } from './generate-speech';
export { streamSpeech as experimental_streamSpeech } from './stream-speech';
export type {
  SpeechStreamPart as Experimental_SpeechStreamPart,
  SpeechStreamUsage as Experimental_SpeechStreamUsage,
  SpeechTextPart as Experimental_SpeechTextPart,
  StreamSpeechResult as Experimental_StreamSpeechResult,
} from './stream-speech-result';
export type { SpeechResult } from './generate-speech-result';
export type { GeneratedAudioFile } from './generated-audio-file';
export type {
  GenerateSpeechEndEvent,
  GenerateSpeechStartEvent,
} from './speech-events';

// deprecated exports

/**
 * @deprecated Use `generateSpeech` instead.
 */
const experimental_generateSpeech: typeof generateSpeech = options => {
  logWarnings({
    warnings: [
      {
        type: 'deprecated',
        setting: 'experimental_generateSpeech',
        message: 'Use generateSpeech instead.',
      },
    ],
  });
  return generateSpeech(options);
};
export { experimental_generateSpeech };

/**
 * @deprecated Use `SpeechResult` instead.
 */
type Experimental_SpeechResult = SpeechResult;
export type { Experimental_SpeechResult };

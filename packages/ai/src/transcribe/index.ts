import type { TranscriptionResult } from './transcribe-result';
import { transcribe } from './transcribe';
import { logWarnings } from '../logger/log-warnings';

export { transcribe } from './transcribe';
export { streamTranscribe as experimental_streamTranscribe } from './stream-transcribe';
export type {
  StreamTranscriptionResult,
  TranscriptionStreamPart,
} from './stream-transcribe-result';
export type { TranscriptionResult } from './transcribe-result';
export type {
  StreamTranscriptionEndEvent as Experimental_StreamTranscriptionEndEvent,
  StreamTranscriptionStartEvent as Experimental_StreamTranscriptionStartEvent,
  TranscriptionEndEvent,
  TranscriptionStartEvent,
} from './transcription-events';

// deprecated exports

/**
 * @deprecated Use `transcribe` instead.
 */
const experimental_transcribe: typeof transcribe = options => {
  logWarnings({
    warnings: [
      {
        type: 'deprecated',
        setting: 'experimental_transcribe',
        message: 'Use transcribe instead.',
      },
    ],
  });
  return transcribe(options);
};
export { experimental_transcribe };

/**
 * @deprecated Use `TranscriptionResult` instead.
 */
type Experimental_TranscriptionResult = TranscriptionResult;
export type { Experimental_TranscriptionResult };

import {
  experimental_transcribe,
  type Experimental_TranscriptionResult,
} from 'ai';

declare const transcriptionModel: any;
declare const audio: Uint8Array;

const result: Experimental_TranscriptionResult =
  await experimental_transcribe({
    model: transcriptionModel,
    audio,
  });

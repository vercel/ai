import { transcribe, type TranscriptionResult } from 'ai';

declare const transcriptionModel: any;
declare const audio: Uint8Array;

const result: TranscriptionResult = await transcribe({
  model: transcriptionModel,
  audio,
});

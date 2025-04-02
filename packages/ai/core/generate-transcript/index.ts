export { generateTranscript as experimental_generateTranscript } from './generate-transcript';
export type { GenerateTranscriptResult as Experimental_GenerateTranscriptResult } from './generate-transcript-result';
export type GeneratedTranscript = {
  text: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  language: string | undefined;
  duration: number | undefined;
};
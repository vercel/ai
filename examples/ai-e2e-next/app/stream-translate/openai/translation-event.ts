export type TranslationEvent =
  | {
      type: 'source-transcript-delta';
      delta: string;
    }
  | {
      type: 'source-transcript-partial';
      text: string;
    }
  | {
      type: 'source-transcript-final';
      text: string;
    }
  | {
      type: 'output-text-delta';
      delta: string;
    }
  | {
      type: 'audio';
      audio: string;
    }
  | {
      type: 'finish';
      sourceText: string;
      translationText: string;
      durationInSeconds?: number;
      usage?: unknown;
      warnings: unknown[];
    }
  | {
      type: 'error';
      message: string;
      fatal: boolean;
    };

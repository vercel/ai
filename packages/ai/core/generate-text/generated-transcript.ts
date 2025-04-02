/**
 * A generated transcript.
 */
export interface GeneratedTranscript {
  /**
Transcript as a string.
     */
  readonly text: string;

  /**
Segments of the transcript with timing information, if available.
     */
  readonly segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;

  /**
  Language of the transcript, if detected.
   */
  readonly language?: string;

  /**
  Duration of the transcript, if available.
   */
  readonly duration?: number;
}

export class DefaultGeneratedTranscript implements GeneratedTranscript {
  readonly text: string;
  readonly segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  readonly language?: string;
  readonly duration?: number;

  constructor({
    text,
    segments = [],
    language,
    duration,
  }: {
    text: string;
    segments?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
    language?: string;
    duration?: number;
  }) {
    this.text = text;
    this.segments = segments;
    this.language = language;
    this.duration = duration;
  }
}

export class DefaultGeneratedTranscriptWithType extends DefaultGeneratedTranscript {
  readonly type = 'transcript';

  constructor(options: {
    text: string;
    segments?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
    language?: string;
    duration?: number;
  }) {
    super(options);
  }
}

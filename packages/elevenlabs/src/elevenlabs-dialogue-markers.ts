export type ElevenLabsDialogueSegment = {
  text: string;
  voiceId: string;
  /** True for the first segment after a speaker marker. */
  newTurn: boolean;
};

const MARKER_START = '[[voice:';
const MARKER_END = ']]';

/**
 * Incremental parser for the inline speaker markers used by ElevenLabs
 * streaming dialogue: `[[voice:<voiceId>]]` starts a new turn for that
 * voice. Text before the first marker belongs to the first registered voice.
 * Markers may be split across deltas; marker text is never emitted, so the
 * characters of the returned segments are exactly what is synthesized.
 */
export class ElevenLabsDialogueMarkerParser {
  private buffer = '';
  private voiceId: string;
  private pendingNewTurn = false;

  constructor(private readonly voices: readonly string[]) {
    const [firstVoice] = voices;
    if (firstVoice == null) {
      throw new Error('ElevenLabs dialogue requires at least one voice.');
    }
    this.voiceId = firstVoice;
  }

  /** Feed one text delta; returns the segments that are now complete. */
  push(delta: string): ElevenLabsDialogueSegment[] {
    this.buffer += delta;
    return this.drain(false);
  }

  /** End of input: returns the remaining text (an unterminated marker is text). */
  flush(): ElevenLabsDialogueSegment[] {
    return this.drain(true);
  }

  private drain(final: boolean): ElevenLabsDialogueSegment[] {
    const segments: ElevenLabsDialogueSegment[] = [];
    while (this.buffer.length > 0) {
      const start = this.buffer.indexOf(MARKER_START);
      if (start === -1) {
        // Hold back a trailing prefix of a marker split across deltas.
        const hold = final ? 0 : partialMarkerPrefixLength(this.buffer);
        this.emitText(
          this.buffer.slice(0, this.buffer.length - hold),
          segments,
        );
        this.buffer = this.buffer.slice(this.buffer.length - hold);
        return segments;
      }
      const end = this.buffer.indexOf(MARKER_END, start + MARKER_START.length);
      if (end === -1) {
        this.emitText(this.buffer.slice(0, start), segments);
        this.buffer = this.buffer.slice(start);
        if (final) {
          this.emitText(this.buffer, segments);
          this.buffer = '';
        }
        return segments;
      }
      this.emitText(this.buffer.slice(0, start), segments);
      const voiceId = this.buffer
        .slice(start + MARKER_START.length, end)
        .trim();
      if (!this.voices.includes(voiceId)) {
        throw new Error(
          `ElevenLabs dialogue marker references unregistered voice "${voiceId}". Add it to providerOptions.elevenlabs.dialogue.voices.`,
        );
      }
      this.voiceId = voiceId;
      this.pendingNewTurn = true;
      this.buffer = this.buffer.slice(end + MARKER_END.length);
    }
    return segments;
  }

  private emitText(text: string, segments: ElevenLabsDialogueSegment[]) {
    if (text.length === 0) return;
    segments.push({
      text,
      voiceId: this.voiceId,
      newTurn: this.pendingNewTurn,
    });
    this.pendingNewTurn = false;
  }
}

function partialMarkerPrefixLength(text: string): number {
  for (
    let length = Math.min(MARKER_START.length - 1, text.length);
    length > 0;
    length--
  ) {
    if (MARKER_START.startsWith(text.slice(text.length - length))) {
      return length;
    }
  }
  return 0;
}

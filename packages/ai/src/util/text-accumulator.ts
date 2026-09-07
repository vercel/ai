class TextAccumulator {
  private chunks: string[];
  private textValue: string;
  private isTextValueStale = false;

  constructor(text: string) {
    this.chunks = text.length > 0 ? [text] : [];
    this.textValue = text;
  }

  /**
   * Returns the cached full text for an accumulator.
   *
   * When new chunks have been appended since the last read, this joins them once
   * and collapses the chunk list back to a single cached string. Subsequent reads
   * are O(1) until another chunk is appended.
   */
  getText() {
    if (this.isTextValueStale) {
      this.textValue = this.chunks.join('');
      this.chunks = [this.textValue];
      this.isTextValueStale = false;
    }

    return this.textValue;
  }

  setText(value: string) {
    this.chunks = value.length > 0 ? [value] : [];
    this.textValue = value;
    this.isTextValueStale = false;
  }

  append(textDelta: string) {
    if (textDelta.length > 0) {
      this.chunks.push(textDelta);
      this.isTextValueStale = true;
    }
  }
}

type TextAccumulatorPart = {
  text: string;
  __textAccumulator?: TextAccumulator;
};

function getTextAccumulator<PART extends { text: string }>(part: PART) {
  return (part as TextAccumulatorPart).__textAccumulator;
}

/**
 * Installs a lazy `text` property on a public object that already exposes
 * `text: string`.
 *
 * This helper stores deltas in an internal chunk
 * array instead, while preserving the public enumerable `text` property.
 *
 * Call `appendToTextAccumulator` for each delta and
 * `finalizeTextAccumulator` when the part is complete.
 */
export function prepareTextAccumulator<PART extends { text: string }>(
  part: PART,
): PART {
  const accumulator = new TextAccumulator(part.text);

  Object.defineProperty(part, '__textAccumulator', {
    configurable: true,
    value: accumulator,
  });

  Object.defineProperty(part, 'text', {
    configurable: true,
    enumerable: true,
    get() {
      return accumulator.getText();
    },
    set(value: string) {
      accumulator.setText(value);
    },
  });

  return part;
}

/**
 * Appends a text delta to a prepared part without joining the full text.
 *
 * If the part was not prepared, this falls back to normal string append
 * semantics. Prepared parts only join chunks when their public `text` getter is
 * read or when they are finalized.
 */
export function appendToTextAccumulator<PART extends { text: string }>({
  part,
  textDelta,
}: {
  part: PART;
  textDelta: string;
}) {
  const accumulator = getTextAccumulator(part);

  if (accumulator == null) {
    part.text = `${part.text}${textDelta}`;
    return;
  }

  accumulator.append(textDelta);
}

/**
 * Replaces the lazy `text` getter with a plain writable string property.
 *
 * Use this when a streaming text/reasoning part reaches its end event. The
 * final public object remains serializable and assignable like a regular
 * `{ text: string }` object, and the internal accumulator state can be released.
 */
export function finalizeTextAccumulator<PART extends { text: string }>(
  part: PART,
) {
  const accumulator = getTextAccumulator(part);

  if (accumulator == null) {
    return;
  }

  Object.defineProperty(part, 'text', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: accumulator.getText(),
  });

  delete (part as TextAccumulatorPart).__textAccumulator;
}

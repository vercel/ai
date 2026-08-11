type TextAccumulatorPart = {
  text: string;
};

class TextAccumulator {
  private chunks: string[];
  private text: string;
  private textLength: number;
  private dirty = false;

  constructor(text: string) {
    this.chunks = text.length > 0 ? [text] : [];
    this.text = text;
    this.textLength = text.length;
  }

  get length() {
    return this.textLength;
  }

  append(textDelta: string) {
    if (textDelta.length === 0) {
      return;
    }

    this.chunks.push(textDelta);
    this.textLength += textDelta.length;
    this.dirty = true;
  }

  setText(text: string) {
    this.chunks = text.length > 0 ? [text] : [];
    this.text = text;
    this.textLength = text.length;
    this.dirty = false;
  }

  getText() {
    if (this.dirty) {
      this.text = this.chunks.join('');
      this.chunks = [this.text];
      this.dirty = false;
    }

    return this.text;
  }
}

const textAccumulators = new WeakMap<TextAccumulatorPart, TextAccumulator>();

/**
 * Prepares a streaming text or reasoning part for chunk-based accumulation.
 */
export function prepareTextAccumulator<PART extends TextAccumulatorPart>(
  part: PART,
): PART {
  const accumulator = new TextAccumulator(part.text);

  textAccumulators.set(part, accumulator);

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

export function appendToTextAccumulator<PART extends TextAccumulatorPart>({
  part,
  textDelta,
}: {
  part: PART;
  textDelta: string;
}) {
  const accumulator = textAccumulators.get(part);

  if (accumulator == null) {
    part.text = `${part.text}${textDelta}`;
    return;
  }

  accumulator.append(textDelta);
}

export function getTextAccumulatorLength<PART extends TextAccumulatorPart>(
  part: PART,
) {
  return textAccumulators.get(part)?.length ?? part.text.length;
}

/**
 * Materializes the accumulated text and releases the internal state.
 */
export function finalizeTextAccumulator<PART extends TextAccumulatorPart>(
  part: PART,
) {
  const accumulator = textAccumulators.get(part);

  if (accumulator == null) {
    return;
  }

  Object.defineProperty(part, 'text', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: accumulator.getText(),
  });
  textAccumulators.delete(part);
}

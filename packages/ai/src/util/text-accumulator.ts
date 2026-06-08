type TextAccumulator = {
  chunks: string[];
  text: string;
  dirty: boolean;
};

const textAccumulators = new WeakMap<object, TextAccumulator>();

/**
 * Returns the materialized text for an accumulator.
 *
 * When new chunks have been appended since the last read, this joins them once
 * and collapses the chunk list back to a single cached string. Subsequent reads
 * are O(1) until another chunk is appended.
 */
function getText(accumulator: TextAccumulator) {
  if (accumulator.dirty) {
    accumulator.text = accumulator.chunks.join('');
    accumulator.chunks = [accumulator.text];
    accumulator.dirty = false;
  }

  return accumulator.text;
}

/**
 * Installs a lazy `text` property on a public object that already exposes
 * `text: string`.
 *
 * Streaming text/reasoning parts receive many small deltas. Repeatedly doing
 * `part.text += delta` can become O(N^2) when callers read `part.text` between
 * writes, because engines may need to flatten and copy the full accumulated
 * string before the next append. This helper stores deltas in an internal
 * `WeakMap` chunk array instead, while preserving the public enumerable
 * `text` property.
 *
 * Call `appendToTextAccumulator` for each delta and
 * `finalizeTextAccumulator` when the part is complete.
 */
export function prepareTextAccumulator<PART extends { text: string }>(
  part: PART,
): PART {
  const accumulator: TextAccumulator = {
    chunks: part.text.length > 0 ? [part.text] : [],
    text: part.text,
    dirty: false,
  };

  textAccumulators.set(part, accumulator);

  Object.defineProperty(part, 'text', {
    configurable: true,
    enumerable: true,
    get() {
      return getText(accumulator);
    },
    set(value: string) {
      accumulator.chunks = value.length > 0 ? [value] : [];
      accumulator.text = value;
      accumulator.dirty = false;
    },
  });

  return part;
}

/**
 * Appends a text delta to a prepared part without materializing the full text.
 *
 * If the part was not prepared, this falls back to normal string append
 * semantics. Prepared parts only materialize when their public `text` getter is
 * read or when they are finalized.
 */
export function appendToTextAccumulator<PART extends { text: string }>({
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

  if (textDelta.length === 0) {
    return;
  }

  accumulator.chunks.push(textDelta);
  accumulator.dirty = true;
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
  const accumulator = textAccumulators.get(part);

  if (accumulator == null) {
    return;
  }

  Object.defineProperty(part, 'text', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: getText(accumulator),
  });

  textAccumulators.delete(part);
}

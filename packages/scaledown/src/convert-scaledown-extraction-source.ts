import type {
  Experimental_DecisionModelV4State as DecisionModelV4State,
  Experimental_ExtractionModelV4Source as ExtractionModelV4Source,
} from '@ai-sdk/provider';

export function convertScaleDownExtractionSource(
  entity: { text: string; start?: number | null; end?: number | null },
  state: DecisionModelV4State,
  ocrText?: string | null,
): ExtractionModelV4Source | undefined {
  if (entity.start == null || entity.end == null || entity.end < entity.start) {
    return undefined;
  }

  const encoder = new TextEncoder();
  if (encoder.encode(entity.text).length !== entity.end - entity.start) {
    return undefined;
  }
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let offset = 0;
  let filePart: number | undefined;

  for (const [partIndex, part] of state.entries()) {
    if (part.type === 'file') {
      filePart = partIndex;
      continue;
    }

    const text = part.type === 'text' ? part.text : JSON.stringify(part.value);
    const bytes = encoder.encode(text);
    if (entity.start >= offset && entity.end <= offset + bytes.length) {
      if (part.type !== 'text') return undefined;

      // ScaleDown reports UTF-8 byte offsets; the SDK uses UTF-16 code units.
      const start = decoder.decode(
        bytes.subarray(0, entity.start - offset),
      ).length;
      const end = decoder.decode(bytes.subarray(0, entity.end - offset)).length;
      if (
        text.slice(start, end) === entity.text &&
        encoder.encode(text.slice(0, start)).length === entity.start - offset
      ) {
        return { type: 'text', part: partIndex, start, end };
      }
      return undefined;
    }
    offset += bytes.length + 1; // Parts are joined with a newline.
  }

  // OCR text is appended after the supplied text. Only cite the file when the
  // span lies beyond that text and the OCR result contains the extracted value.
  if (
    filePart !== undefined &&
    entity.start >= Math.max(0, offset - 1) &&
    ocrText?.includes(entity.text)
  ) {
    return { type: 'file', part: filePart };
  }
  return undefined;
}

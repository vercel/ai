import { safeParseJSON } from '@ai-sdk/provider-utils';
import { createFxSseParser } from './fx-sse';
import { toFxStepSummary, type FxStepSummary } from './fx-usage';

/**
 * One language model stream part of an AI Gateway model response.
 */
export type FxModelStreamPart = {
  /**
   * Type of the stream part.
   */
  type: string;

  /**
   * Other fields of the stream part, which depend on its type.
   */
  [field: string]: unknown;
};

/**
 * Reads an AI Gateway model response (a server-sent event stream of
 * language model stream parts) to its end.
 *
 * Each parsed part is passed to `onPart` as it arrives. Returns the exact
 * body text, which libfx is given unchanged, and the step summary from the
 * response's `finish` part, or no summary when the response ended without
 * one. Event data that is not a JSON object with a `type` is skipped. Read
 * errors are thrown.
 */
export async function readFxModelResponse(options: {
  /**
   * Response to read.
   */
  response: Response;

  /**
   * Receives each stream part in order.
   */
  onPart: (part: FxModelStreamPart) => void;
}): Promise<{ body: string; summary?: FxStepSummary }> {
  const { response, onPart } = options;
  const parser = createFxSseParser();
  const decoder = new TextDecoder();
  let body = '';
  let summary: FxStepSummary | undefined;

  const handle = async (events: string[]) => {
    for (const event of events) {
      const parsed = await safeParseJSON({ text: event });
      if (!parsed.success) continue;
      const part = parsed.value;
      if (
        typeof part !== 'object' ||
        part === null ||
        Array.isArray(part) ||
        typeof (part as { type?: unknown }).type !== 'string'
      ) {
        continue;
      }
      const streamPart = part as FxModelStreamPart;
      if (streamPart.type === 'finish') {
        summary = toFxStepSummary({ finishPart: streamPart });
      }
      onPart(streamPart);
    }
  };

  if (response.body != null) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        body += text;
        await handle(parser.push(text));
      }
    } finally {
      reader.releaseLock();
    }
  }
  const rest = decoder.decode();
  body += rest;
  await handle(parser.push(rest));
  await handle(parser.flush());
  return summary == null ? { body } : { body, summary };
}

import type { FetchFunction } from '@ai-sdk/provider-utils';

/**
 * Bedrock's OpenAI-Responses-compatible endpoints emit terminal error frames
 * the Responses stream schema rejects: typeless AWS error objects
 * (`{"message": "..."}`) and `error` events with a stringified JSON payload.
 * Rewrites those frames into well-formed `error` events so they surface as
 * the provider error they are instead of a schema validation failure. All
 * other frames pass through untouched.
 */
export function createNormalizeResponsesErrorFramesFetch(
  baseFetch: FetchFunction,
): FetchFunction {
  return async (input, init) => {
    const response = await baseFetch(input, init);

    const contentType = response.headers.get('content-type') ?? '';
    if (response.body == null || !contentType.includes('text/event-stream')) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(
      response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(createErrorFrameNormalizingStream())
        .pipeThrough(new TextEncoderStream()),
      {
        status: response.status,
        statusText: response.statusText,
        headers,
      },
    );
  };
}

function createErrorFrameNormalizingStream(): TransformStream<string, string> {
  let buffer = '';
  let lastSequenceNumber = 0;

  function normalizeFrame(frame: string): string {
    // Only single-line `data:` frames are candidates; comments, event fields,
    // and multi-line data frames pass through.
    const lines = frame
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter(line => line.length > 0);
    if (lines.length !== 1 || !lines[0].startsWith('data:')) return frame;

    const payload = lines[0].slice('data:'.length).trim();
    if (payload === '' || payload === '[DONE]') return frame;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return frame;
    }

    if (!isRecord(parsed)) return frame;

    if (typeof parsed.sequence_number === 'number') {
      lastSequenceNumber = parsed.sequence_number;
    }

    const error = extractBedrockStreamError(parsed);
    if (error == null) return frame;

    const sequenceNumber = lastSequenceNumber + 1;
    lastSequenceNumber = sequenceNumber;

    return `data: ${JSON.stringify({
      type: 'error',
      sequence_number: sequenceNumber,
      code: error.code ?? null,
      message: error.message,
      param: null,
    })}\n\n`;
  }

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;
      let frameEnd = nextFrameEnd(buffer);
      while (frameEnd !== -1) {
        controller.enqueue(normalizeFrame(buffer.slice(0, frameEnd)));
        buffer = buffer.slice(frameEnd);
        frameEnd = nextFrameEnd(buffer);
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        controller.enqueue(normalizeFrame(buffer));
        buffer = '';
      }
    },
  });
}

function nextFrameEnd(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return -1;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return crlf + 4;
  return lf + 2;
}

function extractBedrockStreamError(
  frame: Record<string, unknown>,
): { message: string; code?: string | number } | undefined {
  const type = typeof frame.type === 'string' ? frame.type : undefined;

  if (type === 'error') {
    // Well-formed Responses error events pass through: a numeric
    // sequence_number plus a top-level message or the documented nested
    // error shape with a string code.
    if (
      typeof frame.sequence_number === 'number' &&
      (typeof frame.message === 'string' || isValidNestedError(frame.error))
    ) {
      return undefined;
    }
    const message = extractMessage(frame);
    return message != null ? { message, code: extractCode(frame) } : undefined;
  }

  // Typeless frames: AWS JSON error bodies (`{"message": ...}`,
  // `{"Message": ..., "Code": ...}`, `{"errorMessage": ...}`).
  if (type === undefined) {
    const message = extractMessage(frame);
    return message != null ? { message, code: extractCode(frame) } : undefined;
  }

  return undefined;
}

function isValidNestedError(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.type === 'string' &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

function extractMessage(frame: Record<string, unknown>): string | undefined {
  if (typeof frame.message === 'string') return frame.message;
  if (typeof frame.Message === 'string') return frame.Message;
  if (typeof frame.errorMessage === 'string') return frame.errorMessage;

  const error = frame.error;
  // Bedrock wraps AWS error JSON as a string: {"error": "{\"message\":...}"}
  if (typeof error === 'string') {
    try {
      const inner: unknown = JSON.parse(error);
      if (isRecord(inner) && typeof inner.message === 'string') {
        return inner.message;
      }
    } catch {
      // Not JSON; the raw string is the message.
    }
    return error.length > 0 ? error : undefined;
  }
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  const legacyError = frame.Error;
  if (isRecord(legacyError) && typeof legacyError.Message === 'string') {
    return legacyError.Message;
  }

  return undefined;
}

function extractCode(
  frame: Record<string, unknown>,
): string | number | undefined {
  for (const key of ['code', 'Code', 'errorType', '__type']) {
    const value = frame[key];
    if (typeof value === 'string' || typeof value === 'number') return value;
  }
  const error = frame.error;
  if (isRecord(error)) {
    const code = error.code;
    if (typeof code === 'string' || typeof code === 'number') return code;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

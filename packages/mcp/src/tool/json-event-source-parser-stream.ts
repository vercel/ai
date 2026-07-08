import { safeParseJSON } from '@ai-sdk/provider-utils';

export interface JsonServerSentEvent {
  event?: string;
  data: string;
  id?: string;
}

/**
 * Server-Sent Events parser stream for JSON payloads (such as JSON-RPC
 * messages in MCP transports).
 *
 * It follows the SSE specification (events are dispatched when a blank line
 * terminates the frame), with one relaxation: because every MCP payload is a
 * single JSON value, an event is also dispatched as soon as its accumulated
 * `data:` lines form complete, parseable JSON.
 *
 * This is required for interoperability with MCP servers that send
 * `data: {...}\n` without the trailing blank line (`\n\n`) and keep the
 * connection open. A spec-strict parser buffers such frames forever and the
 * client hangs (e.g. `initialize` never resolves).
 *
 * Incomplete JSON (e.g. a message split across network chunks or multiple
 * `data:` lines) is buffered until it either parses or the frame is
 * terminated normally, so spec-compliant servers are unaffected. Pending
 * data that parses as JSON is also dispatched when the stream ends without
 * a final frame terminator.
 */
export class JsonEventSourceParserStream extends TransformStream<
  string,
  JsonServerSentEvent
> {
  constructor() {
    let lineBuffer = '';
    let dataBuffer = '';
    let hasData = false;
    let eventType: string | undefined;
    let lastEventId: string | undefined;

    const dispatch = (
      controller: TransformStreamDefaultController<JsonServerSentEvent>,
    ) => {
      controller.enqueue({
        event: eventType,
        data: dataBuffer,
        id: lastEventId,
      });
      dataBuffer = '';
      hasData = false;
      eventType = undefined;
    };

    const processLine = async (
      line: string,
      controller: TransformStreamDefaultController<JsonServerSentEvent>,
    ) => {
      if (line === '') {
        if (dataBuffer !== '') {
          dispatch(controller);
        } else {
          hasData = false;
          eventType = undefined;
        }
        return;
      }

      if (line.startsWith(':')) {
        return;
      }

      const colonIndex = line.indexOf(':');
      const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
      let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }

      switch (field) {
        case 'data': {
          dataBuffer = hasData ? `${dataBuffer}\n${value}` : value;
          hasData = true;

          // Relaxation for servers that omit the frame terminator:
          // dispatch as soon as the accumulated data is complete JSON.
          if ((await safeParseJSON({ text: dataBuffer })).success) {
            dispatch(controller);
          }
          break;
        }
        case 'event':
          eventType = value;
          break;
        case 'id':
          if (!value.includes('\u0000')) {
            lastEventId = value;
          }
          break;
        default:
          break;
      }
    };

    super({
      async transform(chunk, controller) {
        lineBuffer += chunk;

        let start = 0;
        let i = 0;
        while (i < lineBuffer.length) {
          const char = lineBuffer[i];
          if (char === '\n') {
            await processLine(lineBuffer.slice(start, i), controller);
            start = i + 1;
            i++;
          } else if (char === '\r') {
            // a trailing \r may be followed by \n in the next chunk
            if (i === lineBuffer.length - 1) {
              break;
            }
            await processLine(lineBuffer.slice(start, i), controller);
            i += lineBuffer[i + 1] === '\n' ? 2 : 1;
            start = i;
          } else {
            i++;
          }
        }
        lineBuffer = lineBuffer.slice(start);
      },
      async flush(controller) {
        // process a final line that was not newline-terminated
        if (lineBuffer !== '') {
          const line = lineBuffer.endsWith('\r')
            ? lineBuffer.slice(0, -1)
            : lineBuffer;
          lineBuffer = '';
          await processLine(line, controller);
        }
      },
    });
  }
}

import { openai } from '@ai-sdk/openai';
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
} from 'ai';
import 'dotenv/config';
import { createServer } from 'http';

createServer(async (req, res) => {
  switch (req.url) {
    case '/': {
      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      pipeUIMessageStreamToResponse({
        response: res,
        stream: toUIMessageStream({ stream: result.stream }),
      });
      break;
    }

    case '/stream-data': {
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          // write some custom data
          writer.write({ type: 'start' });

          writer.write({
            type: 'data-custom',
            data: {
              custom: 'Hello, world!',
            },
          });

          const result = streamText({
            model: openai('gpt-4o'),
            prompt: 'Invent a new holiday and describe its traditions.',
          });

          writer.merge(
            toUIMessageStream({
              stream: result.stream,
              sendStart: false,
              onError: error => {
                // Error messages are masked by default for security reasons.
                // If you want to expose the error message to the client, you can do so here:
                return error instanceof Error ? error.message : String(error);
              },
            }),
          );
        },
      });

      pipeUIMessageStreamToResponse({ stream, response: res });

      break;
    }

    // keep the connection alive while the stream is idle.
    // try it with `curl -iN http://localhost:8080/keep-alive`: the response
    // headers arrive immediately (instead of with the first chunk) and a
    // `: keep-alive` comment is sent every 2 seconds until the stream produces
    // its first chunk. this prevents reverse proxies from timing out slow or
    // idle streams.
    case '/keep-alive': {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: 'start' });

          // simulate a slow start, e.g. a long-running tool call:
          await new Promise(resolve => setTimeout(resolve, 10_000));

          writer.write({ type: 'text-start', id: 'text-1' });
          writer.write({
            type: 'text-delta',
            id: 'text-1',
            delta: 'Sorry for the wait!',
          });
          writer.write({ type: 'text-end', id: 'text-1' });
        },
      });

      pipeUIMessageStreamToResponse({
        stream,
        response: res,
        keepAliveMs: 2_000,
      });

      break;
    }
  }
}).listen(8080);

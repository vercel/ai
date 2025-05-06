import { openai } from '@ai-sdk/openai';
import { createDataStream, pipeDataStreamToResponse, streamText } from 'ai';
import 'dotenv/config';
import { createServer } from 'http';

createServer(async (req, res) => {
  switch (req.url) {
    case '/': {
      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      result.pipeDataStreamToResponse(res);
      break;
    }

    case '/stream-data': {
      // immediately start streaming the response
      const dataStream = createDataStream({
        execute: writer => {
          writer.writeData('initialized call');

          const result = streamText({
            model: openai('gpt-4o'),
            prompt: 'Invent a new holiday and describe its traditions.',
          });

          writer.merge(result.toDataStream());
        },
        onError: error => {
          // Error messages are masked by default for security reasons.
          // If you want to expose the error message to the client, you can do so here:
          return error instanceof Error ? error.message : String(error);
        },
      });

      pipeDataStreamToResponse({ response: res, dataStream });
      break;
    }
  }
}).listen(8080);

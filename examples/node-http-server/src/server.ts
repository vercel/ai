import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';
import { createServer } from 'http';

createServer(async (req, res) => {
  switch (req.url) {
    case '/': {
      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      result.pipeUIMessageStreamToResponse(res);
      break;
    }

    case '/stream-data': {
      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      result.pipeUIMessageStreamToResponse(res, {
        onError: error => {
          // Error messages are masked by default for security reasons.
          // If you want to expose the error message to the client, you can do so here:
          return error instanceof Error ? error.message : String(error);
        },
      });

      break;
    }
  }
}).listen(8080);

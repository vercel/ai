import { openai } from '@ai-sdk/openai';
import { Controller, Post, Res } from '@nestjs/common';
import {
  createUIMessageStream,
  streamText,
  pipeUIMessageStreamToResponse,
} from 'ai';
import { Response } from 'express';

@Controller()
export class AppController {
  @Post('/')
  async root(@Res() res: Response) {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: 'Invent a new holiday and describe its traditions.',
    });

    result.pipeUIMessageStreamToResponse(res);
  }

  @Post('/stream-data')
  async streamData(@Res() response: Response) {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // write some data
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
          result.toUIMessageStream({
            sendStart: false,
            onError: (error) => {
              // Error messages are masked by default for security reasons.
              // If you want to expose the error message to the client, you can do so here:
              return error instanceof Error ? error.message : String(error);
            },
          }),
        );
      },
    });
    pipeUIMessageStreamToResponse({ stream, response });
  }
}

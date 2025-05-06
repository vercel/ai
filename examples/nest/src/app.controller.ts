import { openai } from '@ai-sdk/openai';
import { Controller, Post, Res } from '@nestjs/common';
import { createDataStream, pipeDataStreamToResponse, streamText } from 'ai';
import { Response } from 'express';

@Controller()
export class AppController {
  @Post('/')
  async root(@Res() res: Response) {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: 'Invent a new holiday and describe its traditions.',
    });

    result.pipeDataStreamToResponse(res);
  }

  @Post('/stream-data')
  async streamData(@Res() res: Response) {
    const dataStream = createDataStream({
      execute: async (writer) => {
        writer.write({ type: 'data', value: ['initialized call'] });

        const result = streamText({
          model: openai('gpt-4o'),
          prompt: 'Invent a new holiday and describe its traditions.',
        });

        writer.merge(result.toDataStream());
      },
      onError: (error) => {
        // Error messages are masked by default for security reasons.
        // If you want to expose the error message to the client, you can do so here:
        return error instanceof Error ? error.message : String(error);
      },
    });

    pipeDataStreamToResponse({ response: res, dataStream });
  }
}

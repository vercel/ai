import { Controller, Post, Res } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { StreamData, streamText } from 'ai';
import { Response } from 'express';

@Controller()
export class AppController {
  @Post()
  async example(@Res() res: Response) {
    const data = new StreamData();
    data.append('initialized call');

    const result = await streamText({
      model: openai('gpt-4o'),
      prompt: 'Invent a new holiday and describe its traditions.',
      onFinish() {
        data.append('call completed');
        data.close();
      },
    });

    result.pipeDataStreamToResponse(res, { data });
  }
}

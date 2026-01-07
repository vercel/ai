import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  // enum support:
  const result = await generateObject({
    model: google('gemini-exp-1206'),
    schema: z.object({
      title: z.string(),
      kind: z.enum(['text', 'code', 'image']),
    }),
    prompt: 'Generate a software artifact.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});

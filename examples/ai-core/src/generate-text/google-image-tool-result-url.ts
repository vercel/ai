import { google } from '@ai-sdk/google';
import { generateText, stepCountIs, tool } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';

run(async () => {
  const readImage = tool({
    description: `Read and return an image`,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        return {
          success: true,
          description: 'Successfully loaded image',
          imageUrl:
            'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
        };
      } catch (error) {
        throw new Error(`Failed to analyze image: ${error}`);
      }
    },
    toModelOutput(result) {
      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: result.description,
          },
          {
            type: 'image-url',
            url: result.imageUrl,
          },
        ],
      };
    },
  });

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt:
      'Please read the image using the tool provided and return the summary of that image',
    tools: {
      readImage,
    },
    stopWhen: stepCountIs(4),
  });

  console.log(`Assistant response: ${JSON.stringify(result.text, null, 2)}`);
});

import { openai } from '@ai-sdk/openai';
import {
  UIToolInvocation,
  tool,
  experimental_generateImage as generateImage,
} from 'ai';
import { z } from 'zod';

export const generateImageTool = tool({
  description: 'Generate an image',
  inputSchema: z.object({}),
  async execute() {
    const result = await generateImage({
      model: openai.image('gpt-image-1'),
      prompt: 'A beautiful image of a sunset over a calm ocean',
    });

    return {
      mediaType: result.image.mediaType,
      base64: result.image.base64,
    };
  },
  toModelOutput: ({ mediaType, base64 }) => ({
    type: 'content',
    value: [{ type: 'image-data', data: base64, mediaType }],
  }),
});

export type GenerateImageUIToolInvocation = UIToolInvocation<
  typeof generateImageTool
>;

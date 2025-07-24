import { vercel } from '@ai-sdk/vercel';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = streamObject({
    model: vercel('v0-1.5-md'),
    schema: z.object({
      button: z.object({
        element: z.string(),
        baseStyles: z.object({
          padding: z.string(),
          borderRadius: z.string(),
          border: z.string(),
          backgroundColor: z.string(),
          color: z.string(),
          cursor: z.string(),
        }),
        hoverStyles: z.object({
          backgroundColor: z.string(),
          transform: z.string().optional(),
        }),
      }),
    }),
    prompt: 'Generate CSS styles for a modern primary button component.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }

  console.log();
  console.log('Token usage:', await result.usage);
}

main().catch(console.error);

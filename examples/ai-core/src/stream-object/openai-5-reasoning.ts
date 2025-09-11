import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: openai('gpt-5'),
    schema: z.object({
      analysis: z.object({
        topic: z.string(),
        keyPoints: z.array(
          z.object({
            point: z.string(),
            explanation: z.string(),
            importance: z.enum(['low', 'medium', 'high']),
          }),
        ),
        conclusion: z.string(),
        recommendations: z.array(z.string()),
      }),
    }),
    prompt:
      'Analyze the impact of artificial intelligence on modern software development practices.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
}

main().catch(console.error);

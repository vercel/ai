import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result1 = await generateObject({
    model: google('gemini-2.5-flash'),
    prompt: errorMessage,
    schema: z.object({
      error: z.string(),
      stack: z.string(),
    }),
  });

  console.log(result1.object);
  console.log(result1.providerMetadata?.google);
  // e.g.
  // {
  //   groundingMetadata: null,
  //   safetyRatings: null,
  //   usageMetadata: {
  //     thoughtsTokenCount: 1124,
  //     promptTokenCount: 2152,
  //     candidatesTokenCount: 916,
  //     totalTokenCount: 4192
  //   }
  // }

  const result2 = await generateObject({
    model: google('gemini-2.5-flash'),
    prompt: errorMessage,
    schema: z.object({
      error: z.string(),
      stack: z.string(),
    }),
  });

  console.log(result2.object);
  console.log(result2.providerMetadata?.google);

  // e.g.
  // {
  //   groundingMetadata: null,
  //   safetyRatings: null,
  //   usageMetadata: {
  //     cachedContentTokenCount: 1880,
  //     thoughtsTokenCount: 2024,
  //     promptTokenCount: 2152,
  //     candidatesTokenCount: 1072,
  //     totalTokenCount: 5248
  //   }
  // }
}

main().catch(console.error);

import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { streamObject } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result1 = streamObject({
    model: google('gemini-2.5-flash'),
    prompt: errorMessage,
    schema: z.object({
      error: z.string(),
      stack: z.string(),
    }),
  });

  for await (const _ of result1.partialObjectStream) {
    void _;
  }

  const providerMetadata1 = await result1.providerMetadata;
  console.log(providerMetadata1?.google);

  // e.g.
  // {
  //   groundingMetadata: null,
  //   safetyRatings: null,
  //   usageMetadata: {
  //     thoughtsTokenCount: 857,
  //     promptTokenCount: 2152,
  //     candidatesTokenCount: 1075,
  //     totalTokenCount: 4084
  //   }
  // }

  const result2 = streamObject({
    model: google('gemini-2.5-flash'),
    prompt: errorMessage,
    schema: z.object({
      error: z.string(),
      stack: z.string(),
    }),
  });

  for await (const _ of result2.partialObjectStream) {
    void _;
  }

  const providerMetadata2 = await result2.providerMetadata;
  console.log(providerMetadata2?.google);

  // e.g.
  // {
  //   groundingMetadata: null,
  //   safetyRatings: null,
  //   usageMetadata: {
  //     cachedContentTokenCount: 1880,
  //     thoughtsTokenCount: 1381,
  //     promptTokenCount: 2152,
  //     candidatesTokenCount: 914,
  //     totalTokenCount: 4447
  //   }
  // }
}

main().catch(console.error);

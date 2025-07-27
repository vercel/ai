import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result1 = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: errorMessage,
  });

  console.log(result1.text);
  console.log(result1.providerMetadata?.google);
  // e.g.
  // {
  //   groundingMetadata: null,
  //   safetyRatings: null,
  //   usageMetadata: {
  //     thoughtsTokenCount: 634,
  //     promptTokenCount: 2152,
  //     candidatesTokenCount: 694,
  //     totalTokenCount: 3480
  //   }
  // }

  const result2 = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: errorMessage,
  });

  console.log(result2.text);
  console.log(result2.providerMetadata?.google);

  // e.g.
  // {
  //   groundingMetadata: null,
  //   safetyRatings: null,
  //   usageMetadata: {
  //     cachedContentTokenCount: 2027,
  //     thoughtsTokenCount: 702,
  //     promptTokenCount: 2152,
  //     candidatesTokenCount: 710,
  //     totalTokenCount: 3564
  //   }
  // }
}

main().catch(console.error);

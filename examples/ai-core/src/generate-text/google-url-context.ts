import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: google('gemini-2.0-flash-001', {
      useUrlContext: true,
    }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Based on the document: https://ai.google.dev/gemini-api/docs/url-context#limitations.
            Answer this question: How many links we can consume in one request?`,
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('SOURCES');
  console.log(result.sources);
  console.log();
  console.log('PROVIDER METADATA');
  console.log(result.providerMetadata?.google);
}

main().catch(console.error);

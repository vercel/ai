import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = streamText({
    model: bedrock('anthropic.claude-3-5-sonnet-20241022-v2:0'),
    maxOutputTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log(
    'Cache token usage:',
    (await result.providerMetadata)?.bedrock?.usage,
  );
}

main().catch(console.error);

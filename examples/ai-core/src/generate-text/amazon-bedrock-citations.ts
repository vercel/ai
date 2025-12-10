import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const result = await generateText({
    model: bedrock('anthropic.claude-3-7-sonnet-20250219-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Summarize this PDF and provide key points.',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: { enabled: true },
              },
            },
          },
        ],
      },
    ],
  });

  console.log('PDF Response:', result.text);
  console.log('PDF Sources', result.sources);

  if (result.text.length === 0) {
    throw new Error(
      'No response text provided, should have extracted citation content!',
    );
  }
}

main().catch(console.error);

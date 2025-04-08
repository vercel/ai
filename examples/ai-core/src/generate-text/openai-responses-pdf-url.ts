import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is an embedding model according to this document?',
          },
          {
            type: 'file',
            data: new URL(
              'https://github.com/vercel/ai/blob/main/examples/ai-core/data/ai.pdf?raw=true',
            ),
            mediaType: 'application/pdf',
            filename: 'ai.pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);

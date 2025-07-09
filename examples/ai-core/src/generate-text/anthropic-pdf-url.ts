import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
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
<<<<<<< HEAD
            mimeType: 'application/pdf',
=======
            mediaType: 'application/pdf',
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);

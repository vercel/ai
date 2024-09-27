import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: vertex('gemini-1.5-flash'),
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
            data: 'https://github.com/vercel/ai/blob/main/examples/ai-core/data/ai.pdf?raw=true',
            mimeType: 'application/pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);

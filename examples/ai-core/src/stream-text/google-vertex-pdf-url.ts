import { vertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: vertex('gemini-pro-experimental'),
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

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

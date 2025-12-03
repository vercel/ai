import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: perplexity('sonar-pro'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is this document about? Provide a brief summary.',
          },
          {
            type: 'file',
            data: new URL('https://example.com/path/to/document.pdf'),
            mediaType: 'application/pdf',
            filename: 'document.pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);

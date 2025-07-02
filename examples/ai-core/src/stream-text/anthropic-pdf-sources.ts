import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is an embedding model according to this document? Please cite your sources.',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            providerOptions: {
              anthropic: {
                citations: { enabled: true },
                title: 'AI Handbook',
                context:
                  'Technical documentation about AI models and embeddings',
              },
            },
          },
        ],
      },
    ],
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text': {
        process.stdout.write(part.text);
        break;
      }

      case 'source': {
        if (part.sourceType === 'document') {
          console.log(`\n\nDocument Source: ${part.title}`);
          console.log(`Media Type: ${part.mediaType}`);
          if (part.filename) {
            console.log(`Filename: ${part.filename}`);
          }
        }
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main().catch(console.error);

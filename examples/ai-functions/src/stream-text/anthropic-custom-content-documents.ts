import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'text/plain',
            data: '',
            providerOptions: {
              anthropic: {
                source: {
                  type: 'content',
                  content: [
                    { type: 'text' as const, text: 'First custom chunk.' },
                    { type: 'text' as const, text: 'Second custom chunk.' },
                  ],
                },
                citations: { enabled: true },
                title: 'Custom Content Doc',
              },
            },
          },
          {
            type: 'text',
            text: 'Summarize the custom content and include citations.',
          },
        ],
      },
    ],
  });

  let citationCount = 0;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'source':
        if (
          part.sourceType === 'document' &&
          part.providerMetadata?.anthropic
        ) {
          const meta = part.providerMetadata.anthropic;
          console.log(
            `\n\n[${++citationCount}] "${meta.citedText}" (blocks ${meta.startBlockIndex}-${meta.endBlockIndex})`,
          );
          if (part.title) {
            console.log(`Title: ${part.title}`);
          }
        }
        break;
      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }

  console.log(`\n\nTotal citations: ${citationCount}`);
});

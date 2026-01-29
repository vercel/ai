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
            data: 'Search result snippet about quarterly revenue growth.',
            providerOptions: {
              anthropic: {
                type: 'search_result',
                source: 'https://example.com/search/result1',
                citations: { enabled: true },
                title: 'Quarterly Results',
              },
            },
          },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: '',
            providerOptions: {
              anthropic: {
                type: 'search_result',
                source: 'https://example.com/search/result2',
                content: [
                  {
                    type: 'text' as const,
                    text: 'Additional context from the same search result.',
                  },
                ],
                citations: { enabled: true },
                title: 'Additional Context',
              },
            },
          },
          {
            type: 'text',
            text: 'Summarize the search result and include citations.',
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
            `\n\n[${++citationCount}] "${meta.citedText}" (search_result ${meta.searchResultIndex}, blocks ${meta.startBlockIndex}-${meta.endBlockIndex})`,
          );
          console.log(`Source: ${meta.source}`);
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

import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
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

  console.log('Response:', result.text);

  const citations = result.content.filter(part => part.type === 'source');
  citations.forEach((citation, i) => {
    if (
      citation.sourceType === 'document' &&
      citation.providerMetadata?.anthropic
    ) {
      const meta = citation.providerMetadata.anthropic;
      console.log(
        `\n[${i + 1}] "${meta.citedText}" (search_result ${meta.searchResultIndex}, blocks ${meta.startBlockIndex}-${meta.endBlockIndex})`,
      );
      console.log(`Source: ${meta.source}`);
      if (citation.title) {
        console.log(`Title: ${citation.title}`);
      }
    }
  });
});

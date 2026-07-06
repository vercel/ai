import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-5'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'text/plain',
            data: new TextEncoder().encode(
              'The quarterly revenue increased by 25% year over year, driven by strong cloud services adoption.',
            ),
            providerOptions: {
              anthropic: {
                type: 'search_result',
                source: 'https://example.com/reports/q3-2024',
                title: 'Q3 2024 Financial Report',
                citations: { enabled: true },
              },
            },
          },
          {
            type: 'file',
            mediaType: 'text/plain',
            data: new TextEncoder().encode(
              'Operating expenses decreased by 8% due to infrastructure optimization initiatives.',
            ),
            providerOptions: {
              anthropic: {
                type: 'search_result',
                source: 'https://example.com/reports/q3-2024-expenses',
                title: 'Q3 2024 Expense Analysis',
                citations: { enabled: true },
              },
            },
          },
          {
            type: 'text',
            text: 'Summarize the financial performance. Cite your sources.',
          },
        ],
      },
    ],
  });

  console.log('Response:', result.text);
  console.log();

  const citations = result.content.filter(part => part.type === 'source');
  citations.forEach((citation, i) => {
    if (citation.sourceType === 'document') {
      const metadata = citation.providerMetadata?.anthropic;
      console.log(`Citation ${i + 1}:`);
      console.log(`  Title: ${citation.title}`);
      console.log(`  Source: ${metadata?.source}`);
      console.log(`  Cited text: "${metadata?.citedText}"`);
      console.log(`  Search result index: ${metadata?.searchResultIndex}`);
      console.log();
    }
  });
});

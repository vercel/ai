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

  console.log('Response:', result.text);

  const citations = result.content.filter(part => part.type === 'source');
  citations.forEach((citation, i) => {
    if (
      citation.sourceType === 'document' &&
      citation.providerMetadata?.anthropic
    ) {
      const meta = citation.providerMetadata.anthropic;
      console.log(
        `\n[${i + 1}] "${meta.citedText}" (blocks ${meta.startBlockIndex}-${meta.endBlockIndex})`,
      );
      if (citation.title) {
        console.log(`Title: ${citation.title}`);
      }
    }
  });
});

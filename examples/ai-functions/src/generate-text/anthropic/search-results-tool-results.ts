import { anthropic } from '@ai-sdk/anthropic';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const knowledgeBase = [
  {
    title: 'Deployment Guide',
    url: 'https://example.com/docs/deployment',
    text: 'Deployments are triggered automatically on every push to the main branch. Preview deployments are created for pull requests.',
  },
  {
    title: 'Rollback Procedures',
    url: 'https://example.com/docs/rollbacks',
    text: 'To roll back a deployment, promote a previous deployment from the dashboard or use the CLI rollback command.',
  },
];

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-5'),
    tools: {
      search_docs: tool({
        description: 'Search the internal documentation.',
        inputSchema: z.object({ query: z.string() }),
        execute: async () => ({ results: knowledgeBase }),
        // Return the search hits as citable search result blocks inside the
        // tool result. Claude cites them like web search results.
        toModelOutput: ({ output }) => ({
          type: 'content',
          value: output.results.map(item => ({
            type: 'text',
            text: item.text,
            providerOptions: {
              anthropic: {
                type: 'search_result',
                source: item.url,
                title: item.title,
                citations: { enabled: true },
              },
            },
          })),
        }),
      }),
    },
    stopWhen: isStepCount(3),
    prompt:
      'What does the documentation say about deployments and rollbacks? Cite your sources.',
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
      console.log();
    }
  });
});

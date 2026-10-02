import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4.7'),
    tools: {
      web_search: xai.tools.webSearch({
        allowedDomains: ['docs.x.ai'],
      }),
    },
    providerOptions: {
      xai: {
        // Bound xAI's server-side search loop within this single API request.
        maxTurns: 2,
        // Disable inline citation links while retaining structured sources.
        include: ['no_inline_citations'],
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt:
      'According to the xAI documentation, what is the recommended API for text generation? Answer in one sentence.',
  });

  const sources = result.content.filter(part => part.type === 'source');

  console.log('Text:', result.text);
  console.log('Sources:', sources);

  if (sources.length === 0) {
    throw new Error('Expected xAI web search to return structured sources.');
  }
});

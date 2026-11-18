import {
  perplexity,
  type PerplexityDecisionModelOptions,
} from '@ai-sdk/perplexity';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: perplexity.decisionModel('pplx-decider-latest'),
    state: 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope',
    questions: {
      launched: {
        type: 'boolean',
        instructions: 'Did Webb launch in December 2021?',
      },
    },
    providerOptions: {
      perplexity: {
        mode: 'web_grounding',
        maxStaleness: 86400,
      } satisfies PerplexityDecisionModelOptions,
    },
  });

  console.log('Answers:', result.answers);
  console.log(
    'Search results:',
    result.providerMetadata?.perplexity.searchResults,
  );
  console.log(
    'Fetched pages:',
    result.providerMetadata?.perplexity.fetchedResults,
  );
  console.log('Tool calls:', result.providerMetadata?.perplexity.toolCalls);
});

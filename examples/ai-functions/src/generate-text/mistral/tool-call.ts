import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: mistral.conversations('mistral-medium-latest'),
    tools: {
      webSearch: mistral.tools.webSearch(),
    },
    providerOptions: {
      mistral: {
        store: false,
      },
    },
    prompt:
      'Use web search to find the current stable Node.js release. Explain whether it is LTS and cite sources.',
  });

  console.log(result.text);
  console.log('Sources:', result.sources);
  console.log('Tool calls:', result.toolCalls);
  console.log('Tool results:', result.toolResults);
});

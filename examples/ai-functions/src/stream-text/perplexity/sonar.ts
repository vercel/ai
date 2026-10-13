import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    // Direct Agent API model ID (not a preset):
    model: perplexity('perplexity/sonar'),
    prompt: 'What has happened in San Francisco recently?',
    providerOptions: {
      perplexity: {
        // Direct model IDs do not include preset tools. Without an explicit
        // web_search tool, the response contains no sources.
        tools: [{ type: 'web_search' }],
      } satisfies PerplexityLanguageModelOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Model:', (await result.response).modelId);
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log(
    'Metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );

  const sources = await result.sources;
  console.log('Sources:', sources.length);
  for (const source of sources) {
    if (source.sourceType === 'url') {
      console.log(`- ${source.title}: ${source.url}`);
    }
  }
});

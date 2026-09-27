import 'dotenv/config';
import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
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

  console.log(result.text);
  console.log();
  console.log('Model:', result.response.modelId);
  console.log('Sources:', result.sources.length);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.providerMetadata);

  for (const source of result.sources) {
    if (source.sourceType === 'url') {
      console.log(`- ${source.title}: ${source.url}`);
    }
  }
}

main().catch(console.error);

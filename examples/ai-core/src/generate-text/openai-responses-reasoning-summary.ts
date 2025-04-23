import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('o3-mini'),
    prompt:
      'Tell me about the debate over Taqueria La Cumbre and El Farolito and who created the San Francisco Mission-style burrito.',
    providerOptions: {
      openai: {
        // https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries
        reasoningSummary: 'auto', // 'detailed'
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log(result.reasoning);
  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', {
    ...result.usage,
    reasoningTokens: result.providerMetadata?.openai?.reasoningTokens,
  });
  console.log();
  console.log('Request:', JSON.stringify(result.request, null, 2));
  console.log('Response:', JSON.stringify(result.response, null, 2));
}

main().catch(console.error);

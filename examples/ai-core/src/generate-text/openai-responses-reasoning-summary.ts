import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    // supported: o4-mini, o3, o3-mini and o1
    model: openai.responses('o3-mini'),
    prompt:
      'Tell me about the debate over Taqueria La Cumbre and El Farolito and who created the San Francisco Mission-style burrito.',
    providerOptions: {
      openai: {
        // https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries
        reasoningSummary: 'auto', // auto gives you the best available summary (detailed > auto > None)
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  process.stdout.write('\x1b[34m');
  console.log(JSON.stringify(result.reasoning, null, 2));
  process.stdout.write('\x1b[0m');
  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
  console.log();
  console.log('Request body:', JSON.stringify(result.request.body, null, 2));
  console.log('Response body:', JSON.stringify(result.response.body, null, 2));
}

main().catch(console.error);

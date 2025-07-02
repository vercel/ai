import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
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

  for await (const part of result.fullStream) {
    if (['reasoning-start', 'reasoning', 'reasoning-end'].includes(part.type)) {
      process.stdout.write('\x1b[34m');
    }
    console.log(JSON.stringify(part, null, 2));
    if (['reasoning-start', 'reasoning', 'reasoning-end'].includes(part.type)) {
      process.stdout.write('\x1b[0m');
    }
  }
  console.log(await result.text);
  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log();
  console.log('Request:', JSON.stringify(await result.request, null, 2));
  console.log('Response:', JSON.stringify(await result.response, null, 2));
}

main().catch(console.error);

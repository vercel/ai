import 'dotenv/config';
import { xai, XaiProviderOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: xai('grok-4.6'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      xai: {
        reasoningEffort: 'xhigh',
      } satisfies XaiProviderOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);

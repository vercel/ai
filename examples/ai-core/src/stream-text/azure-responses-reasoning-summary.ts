import 'dotenv/config';
import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: azure.responses('gpt-5-mini'), // use your own deployment
    system: 'You are a helpful assistant.',
    prompt:
      'Tell me about the debate over Taqueria La Cumbre and El Farolito and who created the San Francisco Mission-style burrito.',
    providerOptions: {
      openai: {
        // https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries
        // reasoningSummary: 'auto', // 'detailed'
        reasoningSummary: 'auto',
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log('Provider metadata:', await result.providerMetadata);
}

main().catch(console.error);

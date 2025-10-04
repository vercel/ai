import 'dotenv/config';
import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
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

  console.log('\n=== Basic Text Generation ===');
  console.log('text:', result.text);
  console.log('\n=== Other Outputs ===');
  console.log('reasoning:', result.reasoningText);
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
}

main().catch(console.error);

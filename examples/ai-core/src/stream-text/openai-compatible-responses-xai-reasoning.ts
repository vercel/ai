import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

async function main() {
  const xai = createOpenAICompatible({
    baseURL: 'https://api.x.ai/v1',
    name: 'xai',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
  });

  const result = streamText({
    model: xai.responsesModel('grok-2-1212'),
    system: 'You are a helpful assistant.',
    prompt: 'Explain why the sky is blue using physics principles.',
    maxOutputTokens: 500,
    providerOptions: {
      xai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
      },
    },
  });

  console.log('Streaming response:');
  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`[REASONING] ${part.text}`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log('Reasoning tokens:', (await result.usage).reasoningTokens);
}

main().catch(console.error);

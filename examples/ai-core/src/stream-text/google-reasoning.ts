import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash-preview-05-20'),
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco?',
    stopWhen: stepCountIs(2),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 1024,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    },
    onError: console.error,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

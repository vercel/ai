import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash-preview-05-20'),
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco?',
    maxSteps: 2,
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
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.textDelta);
        break;
      }

      case 'reasoning': {
        process.stdout.write('\x1b[34m' + part.textDelta + '\x1b[0m');
        break;
      }

      case 'tool-call': {
        process.stdout.write(
          `\nTool call: '${part.toolName}' ${JSON.stringify(part.args)}`,
        );
        break;
      }

      case 'tool-result': {
        process.stdout.write(
          `\nTool response: '${part.toolName}' ${JSON.stringify(part.result)}`,
        );
        break;
      }

      case 'error': {
        process.stdout.write('\x1b[31m' + part.error + '\x1b[0m');
        break;
      }
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
<<<<<<< HEAD
import { streamText } from 'ai';
=======
import { stepCountIs, streamText } from 'ai';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash-preview-05-20'),
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco?',
<<<<<<< HEAD
    maxSteps: 2,
=======
    stopWhen: stepCountIs(2),
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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
<<<<<<< HEAD
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
=======
    if (part.type === 'reasoning') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text') {
      process.stdout.write(part.text);
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

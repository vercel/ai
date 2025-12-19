import 'dotenv/config';
import {
  createOpenAICompatible,
  OpenAICompatibleProviderOptions,
} from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const deepseek = createOpenAICompatible({
    baseURL: 'https://api.deepseek.com/v1',
    name: 'deepseek',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    fetch: async (url, options) => {
      const body = JSON.parse(options!.body! as string);
      console.log('Request messages:', JSON.stringify(body.messages, null, 2));
      console.log();
      return await fetch(url, options);
    },
  });

  const model = deepseek.chatModel('deepseek-reasoner');

  console.log('Turn 1: Initial tool call with reasoning\n');

  const result1 = streamText({
    model,
    prompt: 'What is the weather in San Francisco?',
    tools: { weather: weatherTool },
    providerOptions: {
      deepseek: {
        sendReasoning: true,
      } satisfies OpenAICompatibleProviderOptions,
    },
  });

  for await (const part of result1.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m'); // blue
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  const messages1 = (await result1.response).messages;
  console.log('\n\n');

  // Turn 2: Follow-up question WITH sendReasoning: true
  console.log('Turn 2: Follow-up with sendReasoning: true\n');

  const result2 = streamText({
    model,
    messages: [
      ...messages1,
      { role: 'user', content: 'Should I bring an umbrella?' },
    ],
    tools: { weather: weatherTool },
    providerOptions: {
      deepseek: {
        sendReasoning: true,
      } satisfies OpenAICompatibleProviderOptions,
    },
  });

  for await (const part of result2.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
}

main().catch(console.error);

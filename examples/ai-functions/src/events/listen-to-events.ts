import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import {
  generateText,
  listenOnStart,
  listenOnStepStart,
  listenOnToolCallStart,
  listenOnToolCallFinish,
  listenOnStepFinish,
  on,
  stepCountIs,
  tool,
} from 'ai';
import * as z from 'zod';

// Subscribe to events before calling generateText
const unsubscribeStart = listenOnStart(event => {
  console.log('\n--- listenOnStart ---');
  console.log('Provider:', event.model.provider);
  console.log('Model:', event.model.modelId);
  console.log('Temperature:', event.temperature);
});

const unsubscribeStepStart = listenOnStepStart(event => {
  console.log('\n--- listenOnStepStart ---');
  console.log('Step:', event.stepNumber);
  console.log('Message count:', event.messages.length);
});

const unsubscribeToolCallStart = listenOnToolCallStart(event => {
  console.log('\n--- listenOnToolCallStart ---');
  console.log('Tool:', event.toolCall.toolName);
  console.log('Input:', JSON.stringify(event.toolCall.input));
});

const unsubscribeToolCallFinish = listenOnToolCallFinish(event => {
  console.log('\n--- listenOnToolCallFinish ---');
  console.log('Tool:', event.toolCall.toolName);
  console.log('Duration:', event.durationMs, 'ms');
  console.log('Success:', event.success);
  if (event.success) {
    console.log('Output:', event.output);
  }
});

const unsubscribeStepFinish = listenOnStepFinish(event => {
  console.log('\n--- listenOnStepFinish ---');
  console.log('Step:', event.stepNumber);
  console.log('Finish reason:', event.finishReason);
  console.log('Input tokens:', event.usage.inputTokens);
  console.log('Output tokens:', event.usage.outputTokens);
});

const unsubscribeFinish = on('ai:finish', event => {
  console.log('\n--- ai:finish ---');
  console.log('Total steps:', event.steps.length);
  console.log('Total input tokens:', event.totalUsage.inputTokens);
  console.log('Total output tokens:', event.totalUsage.outputTokens);
  console.log('Final text:', event.text);
});

async function main() {
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: 'What is the weather in San Francisco?',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get weather for'),
        }),
        execute: async ({ location }) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { temperature: 72, condition: 'sunny', location };
        },
      }),
    },
    stopWhen: stepCountIs(3),
  });

  console.log('\n=== FINAL RESULT ===');
  console.log(result.text);

  // Cleanup subscriptions
  unsubscribeStart();
  unsubscribeStepStart();
  unsubscribeToolCallStart();
  unsubscribeToolCallFinish();
  unsubscribeStepFinish();
  unsubscribeFinish();
}

main().catch(console.error);

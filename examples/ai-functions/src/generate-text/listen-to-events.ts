import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import * as z from 'zod';

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
    experimental_onStart: event => {
      console.log('\n--- onStart ---');
      console.log('Provider:', event.model.provider);
      console.log('Model:', event.model.modelId);
      console.log('Temperature:', event.temperature);
    },
    experimental_onStepStart: event => {
      console.log('\n--- onStepStart ---');
      console.log('Step:', event.stepNumber);
      console.log('Message count:', event.messages.length);
    },
    experimental_onToolCallStart: event => {
      console.log('\n--- onToolCallStart ---');
      console.log('Tool:', event.toolCall.toolName);
      console.log('Input:', JSON.stringify(event.toolCall.input));
    },
    experimental_onToolCallFinish: event => {
      console.log('\n--- onToolCallFinish ---');
      console.log('Tool:', event.toolCall.toolName);
      console.log('Duration:', event.durationMs, 'ms');
      console.log('Success:', event.success);
      if (event.success) {
        console.log('Output:', event.output);
      }
    },
    onStepFinish: event => {
      console.log('\n--- onStepFinish ---');
      console.log('Step:', event.stepNumber);
      console.log('Finish reason:', event.finishReason);
      console.log('Input tokens:', event.usage.inputTokens);
      console.log('Output tokens:', event.usage.outputTokens);
    },
    onFinish: event => {
      console.log('\n--- onFinish ---');
      console.log('Total steps:', event.steps.length);
      console.log('Total input tokens:', event.totalUsage.inputTokens);
      console.log('Total output tokens:', event.totalUsage.outputTokens);
      console.log('Final text:', event.text);
    },
  });

  console.log('\n=== FINAL RESULT ===');
  console.log(result.text);
}

main().catch(console.error);
